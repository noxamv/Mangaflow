import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as cheerio from 'cheerio';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 429) {
        console.warn(`[Rate Limited] Waiting 5s before retrying ${url}`);
        await sleep(5000 * attempt);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2000 * attempt);
    }
  }
}

/**
 * Use Gemini API as an intelligent parser fallback for complex webtoon/manga layouts
 */
async function aiScoutLatestChapter(title, snippet) {
  if (!genAI) return null;
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `
Extract the exact highest chapter number released for the series "${title}" from the raw HTML/text snippet below.
Also extract the status (ongoing, completed, or hiatus).

Snippet:
${snippet.slice(0, 8000)}

Return ONLY valid JSON matching this structure:
{"latest_chapter": number, "status": "ongoing" | "completed" | "hiatus"}
`;
    const response = await model.generateContent(prompt);
    const cleaned = response.response.text().replace(/```json|```/g, '').trim();
    const data = JSON.parse(cleaned);
    return typeof data.latest_chapter === 'number' ? data : null;
  } catch (e) {
    console.warn(`[Gemini Scout Fallback Failed] ${title}:`, e.message);
    return null;
  }
}

async function scoutSeriesIntel() {
  console.log('--- Starting Scout Intel Pipeline ---');

  // Select series tracked in series_intel
  const { data: targets, error } = await supabase
    .from('series_intel')
    .select('id, series_id, source_platform, target_url, target_identifier, latest_known_chapter, series:series_id(id, title, status)')
    .order('last_scouted_at', { ascending: true, nullsFirst: true })
    .limit(30);

  if (error || !targets) {
    console.error('Error fetching series_intel:', error?.message);
    return;
  }

  for (const item of targets) {
    const seriesTitle = item.series?.title || 'Unknown';
    if (!item.target_url) continue;

    console.log(`\nScouting [${seriesTitle}] on ${item.source_platform}...`);
    try {
      let maxChapterFound = 0;

      if (item.source_platform === 'mangadex') {
        // Use MangaDex REST API directly to avoid DOM parsing issues
        const mangaDexId = item.target_identifier || item.target_url.split('/').pop();
        const apiRes = await fetch(`https://api.mangadex.org/manga/${mangaDexId}/feed?limit=1&order[chapter]=desc&translatedLanguage[]=en`, { headers: HEADERS });
        if (apiRes.ok) {
          const json = await apiRes.json();
          const first = json.data?.[0];
          if (first && first.attributes?.chapter) {
            maxChapterFound = parseFloat(first.attributes.chapter);
          }
        }
      } else {
        // Scrape aggregator/scanlator HTML
        const html = await fetchWithRetry(item.target_url);
        const $ = cheerio.load(html);

        // Regex scan for numbers in links
        $('a').each((_, el) => {
          const text = $(el).text();
          const href = $(el).attr('href') || '';
          const match = text.match(/Chapter\s+([\d.]+)/i) || href.match(/chapter-([\d.]+)/i);
          if (match) {
            const chNum = parseFloat(match[1]);
            if (chNum > maxChapterFound && chNum < 10000) {
              maxChapterFound = chNum;
            }
          }
        });

        // If regex found nothing or seems stuck, invoke Gemini AI extraction
        if (maxChapterFound === 0 && GEMINI_API_KEY) {
          console.log(`Regex yielded 0 chapters for ${seriesTitle}. Running Gemini AI Scout...`);
          const aiResult = await aiScoutLatestChapter(seriesTitle, html);
          if (aiResult?.latest_chapter) {
            maxChapterFound = aiResult.latest_chapter;
            console.log(`Gemini detected latest chapter: ${maxChapterFound}`);
          }
        }
      }

      if (maxChapterFound > 0) {
        console.log(`Updated ${seriesTitle}: Latest Chapter = ${maxChapterFound}`);
        await supabase
          .from('series_intel')
          .update({
            latest_known_chapter: maxChapterFound,
            last_scouted_at: new Date().toISOString()
          })
          .eq('id', item.id);

        // Reset series sync status so sync-multi-source picks up new chapters
        await supabase
          .from('series')
          .update({
            sync_status: 'IDLE',
            delay_retry_count: 0
          })
          .eq('id', item.series_id);
      }
    } catch (err) {
      console.error(`Failed scouting ${seriesTitle}:`, err.message);
    }
    await sleep(1000);
  }
  console.log('\n--- Scout Intel Finished ---');
}

scoutSeriesIntel();
