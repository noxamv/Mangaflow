import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

function parseMangapill(html) {
  const $ = cheerio.load(html);
  const chapters = [];
  $('a[href*="/chapters/"]').each((_, el) => {
    const href = $(el).attr('href');
    const titleText = $(el).text().trim();
    if (!href) return;

    const match = titleText.match(/Chapter\s+([\d.]+)/i) || href.match(/-chapter-([\d.]+)/i);
    if (match) {
      chapters.push({
        chapter_number: parseFloat(match[1]),
        title: titleText,
        external_id: href.startsWith('http') ? href : `https://mangapill.com${href}`
      });
    }
  });
  return chapters;
}

async function fetchMangaDexChapters(mangaDexId) {
  const chapters = [];
  let offset = 0;
  const limit = 100;
  let total = 100;

  while (offset < total) {
    const url = `https://api.mangadex.org/manga/${mangaDexId}/feed?limit=${limit}&offset=${offset}&order[chapter]=asc&translatedLanguage[]=en`;
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) break;
    const json = await res.json();
    total = json.total || 0;

    for (const item of json.data || []) {
      const chNum = parseFloat(item.attributes.chapter);
      if (!isNaN(chNum)) {
        chapters.push({
          chapter_number: chNum,
          title: item.attributes.title || `Chapter ${chNum}`,
          external_id: item.id
        });
      }
    }
    offset += limit;
    await sleep(250);
  }
  return chapters;
}

async function sync() {
  console.log('=== Hybrid Chapter Synchronization Starting ===');

  // Prioritize active backlogs
  const { data: targets, error } = await supabase
    .from('series_intel')
    .select('id, series_id, source_platform, target_url, target_identifier, series:series_id(id, title)')
    .order('last_scouted_at', { ascending: false })
    .limit(10);

  if (error || !targets) {
    console.error('Failed to query series:', error?.message);
    return;
  }

  for (const item of targets) {
    const seriesId = item.series_id;
    const title = item.series?.title || 'Unknown';
    console.log(`\nSynchronizing [${title}] from [${item.source_platform}]...`);

    // 1. Fetch currently recorded chapters
    const { data: existingRows } = await supabase
      .from('chapters')
      .select('chapter_number')
      .eq('series_id', seriesId);

    const existingSet = new Set((existingRows || []).map((r) => Number(r.chapter_number)));
    console.log(`Database holds: ${existingSet.size} chapters.`);

    // 2. Fetch from source
    let remoteChapters = [];
    try {
      if (item.source_platform === 'mangadex') {
        const dexId = item.target_identifier || item.target_url.split('/').pop();
        remoteChapters = await fetchMangaDexChapters(dexId);
      } else if (item.source_platform === 'mangapill') {
        const html = await fetchHtml(item.target_url);
        remoteChapters = parseMangapill(html);
      }
    } catch (err) {
      console.warn(`Extraction failed for ${title}:`, err.message);
      continue;
    }

    // 3. Strict Deduplication Gate
    const missing = remoteChapters.filter((rc) => !existingSet.has(rc.chapter_number));
    console.log(`Found ${remoteChapters.length} upstream chapters. ${missing.length} new chapters to ingest.`);

    if (missing.length === 0) continue;

    // 4. Safe Batch Upsert (Chunks of 50)
    const BATCH = 50;
    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH).map((c) => ({
        series_id: seriesId,
        chapter_number: c.chapter_number,
        title: c.title,
        source: item.source_platform,
        source_provider: item.source_platform,
        source_platform: item.source_platform,
        external_id: c.external_id,
        pages: []
      }));

      const { error: insertErr } = await supabase
        .from('chapters')
        .upsert(chunk, { onConflict: 'series_id,chapter_number' });

      if (insertErr) {
        console.error(`Batch insert error at offset ${i}:`, insertErr.message);
      } else {
        console.log(`-> Upserted chapters ${chunk[0].chapter_number} to ${chunk[chunk.length - 1].chapter_number}`);
      }
      await sleep(250);
    }
  }

  console.log('\n=== Chapter Synchronization Finished ===');
}

sync();
