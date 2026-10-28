import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as cheerio from 'cheerio';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_SERVICE_KEY || 
  process.env.SUPABASE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  console.error('URL present:', Boolean(SUPABASE_URL));
  console.error('Key present:', Boolean(SUPABASE_SERVICE_ROLE_KEY));
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchHtml(url, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (res.status === 429) {
        await sleep(4000 * i);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(1500 * i);
    }
  }
}

async function aiScoutChapterNumber(seriesTitle, htmlSnippet) {
  if (!genAI) return null;
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `
Extract the exact latest released chapter number for "${seriesTitle}" from this snippet.
Return ONLY JSON: {"latest_chapter": number, "status": "ongoing"|"completed"|"hiatus"}

Snippet:
${htmlSnippet.slice(0, 7000)}
`;
    const res = await model.generateContent(prompt);
    const cleaned = res.response.text().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return typeof parsed.latest_chapter === 'number' ? parsed.latest_chapter : null;
  } catch {
    return null;
  }
}

async function scout() {
  console.log('=== Hybrid Scout Intel Engine Starting ===');

  const { data: targets, error } = await supabase
    .from('series_intel')
    .select('id, series_id, source_platform, target_url, target_identifier, latest_known_chapter, series:series_id(title)')
    .order('last_scouted_at', { ascending: true, nullsFirst: true })
    .limit(25);

  if (error || !targets) {
    console.error('Failed to query series_intel:', error?.message);
    return;
  }

  for (const item of targets) {
    const title = item.series?.title || 'Unknown';
    if (!item.target_url) continue;

    console.log(`\nScouting [${title}] on [${item.source_platform}]...`);
    let detectedLatest = 0;

    try {
      if (item.source_platform === 'mangadex') {
        const dexId = item.target_identifier || item.target_url.split('/').pop();
        const res = await fetch(`https://api.mangadex.org/manga/${dexId}/feed?limit=1&order[chapter]=desc&translatedLanguage[]=en`, { headers: BROWSER_HEADERS });
        if (res.ok) {
          const json = await res.json();
          const ch = json.data?.[0]?.attributes?.chapter;
          if (ch) detectedLatest = parseFloat(ch);
        }
      } else {
        const html = await fetchHtml(item.target_url);
        const $ = cheerio.load(html);

        $('a').each((_, el) => {
          const t = $(el).text();
          const href = $(el).attr('href') || '';
          const match = t.match(/Chapter\s+([\d.]+)/i) || href.match(/chapter-([\d.]+)/i);
          if (match) {
            const num = parseFloat(match[1]);
            if (num > detectedLatest && num < 10000) detectedLatest = num;
          }
        });

        if (detectedLatest === 0 && GEMINI_API_KEY) {
          console.log(`Regex missed on ${title}. Engaging Gemini intelligent fallback...`);
          const aiNum = await aiScoutChapterNumber(title, html);
          if (aiNum) detectedLatest = aiNum;
        }
      }

      if (detectedLatest > 0) {
        console.log(`-> Detected latest for ${title}: Ch. ${detectedLatest}`);
        await supabase
          .from('series_intel')
          .update({
            latest_known_chapter: detectedLatest,
            last_scouted_at: new Date().toISOString()
          })
          .eq('id', item.id);

        await supabase
          .from('series')
          .update({ sync_status: 'IDLE', delay_retry_count: 0 })
          .eq('id', item.series_id);
      }
    } catch (err) {
      console.warn(`Scout skipped ${title}:`, err.message);
    }
    await sleep(1000);
  }
  console.log('\n=== Scout Completed ===');
}

scout();
