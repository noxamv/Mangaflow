import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

async function safeFetch(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 429) {
        console.warn(`Rate limited (429) on ${url}. Sleeping 5s...`);
        await sleep(5000 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(2000 * (i + 1));
    }
  }
}

/**
 * Parses chapter lists from Mangapill safely
 */
function parseMangapillChapters(html) {
  const $ = cheerio.load(html);
  const chapters = [];
  $('a[href*="/chapters/"]').each((_, el) => {
    const href = $(el).attr('href');
    const titleText = $(el).text().trim();
    if (!href) return;

    const match = titleText.match(/Chapter\s+([\d.]+)/i) || href.match(/-chapter-([\d.]+)/i);
    if (match) {
      const chNum = parseFloat(match[1]);
      chapters.push({
        chapter_number: chNum,
        title: titleText,
        external_id: href.startsWith('http') ? href : `https://mangapill.com${href}`,
        source: 'mangapill',
        source_provider: 'mangapill'
      });
    }
  });
  return chapters;
}

/**
 * Synchronizes a single series with strict deduplication
 */
async function syncSeries(seriesId, title, targetUrl, platform) {
  console.log(`\nChecking: [${title}] via ${platform}`);

  // 1. Fetch currently existing chapter numbers in DB
  const { data: existingRows, error: fetchErr } = await supabase
    .from('chapters')
    .select('chapter_number')
    .eq('series_id', seriesId);

  if (fetchErr) {
    console.error(`Error loading existing chapters for ${title}:`, fetchErr.message);
    return;
  }

  const existingSet = new Set((existingRows || []).map((r) => Number(r.chapter_number)));
  console.log(`Current DB count: ${existingSet.size} chapters.`);

  // 2. Fetch remote source
  let remoteChapters = [];
  if (platform === 'mangapill') {
    const html = await safeFetch(targetUrl);
    remoteChapters = parseMangapillChapters(html);
  }

  console.log(`Remote chapters discovered: ${remoteChapters.length}`);

  // 3. Strict filter: only insert chapters that do NOT exist in Supabase
  const missing = remoteChapters.filter((rc) => !existingSet.has(rc.chapter_number));
  console.log(`Chapters to insert: ${missing.length}`);

  if (missing.length === 0) return;

  // 4. Batch upsert in chunks of 50 to avoid connection limits
  const BATCH_SIZE = 50;
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const chunk = missing.slice(i, i + BATCH_SIZE).map((c) => ({
      series_id: seriesId,
      chapter_number: c.chapter_number,
      title: c.title,
      source: c.source,
      source_provider: c.source_provider,
      external_id: c.external_id,
      pages: [] // Queued for image resolver
    }));

    const { error: insertErr } = await supabase
      .from('chapters')
      .upsert(chunk, { onConflict: 'series_id,chapter_number' });

    if (insertErr) {
      console.error(`Error writing batch:`, insertErr.message);
    } else {
      console.log(`Upserted ${chunk.length} chapters (${chunk[0].chapter_number} - ${chunk[chunk.length - 1].chapter_number})`);
    }
    await sleep(300);
  }
}

// Main runner prioritizing top missing series
async function main() {
  const { data: seriesList, error } = await supabase
    .from('series_intel')
    .select('series_id, source_platform, target_url, series:series_id(title)')
    .eq('source_platform', 'mangapill')
    .limit(20);

  if (error || !seriesList) {
    console.error('Error fetching series targets:', error?.message);
    return;
  }

  for (const item of seriesList) {
    if (!item.target_url) continue;
    try {
      await syncSeries(item.series_id, item.series?.title || 'Unknown', item.target_url, item.source_platform);
    } catch (err) {
      console.error(`Failed ${item.series?.title}:`, err.message);
    }
    await sleep(1500); // Respectful pause between series
  }
}

main();
