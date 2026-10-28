// Polyfill global WebSocket for Supabase on Node environments
if (typeof globalThis.WebSocket === 'undefined') {
  try {
    const { default: WebSocket } = await import('ws');
    globalThis.WebSocket = WebSocket;
  } catch (e) {
    globalThis.WebSocket = class DummyWebSocket {};
  }
}

import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_SERVICE_KEY || 
  process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

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
        await sleep(3000 * i);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(1000 * i);
    }
  }
}

function parseMangapillPages(html) {
  const $ = cheerio.load(html);
  const pages = [];
  $('picture img, img.lazy, .container-reader img').each((_, el) => {
    const src = $(el).attr('data-src') || $(el).attr('src');
    if (src && !pages.includes(src)) {
      pages.push(src);
    }
  });
  return pages;
}

async function fetchMangaDexPages(chapterDexId) {
  try {
    const res = await fetch(`https://api.mangadex.org/at-home/server/${chapterDexId}`, { headers: BROWSER_HEADERS });
    if (!res.ok) return [];
    const json = await res.json();
    const baseUrl = json.baseUrl;
    const hash = json.chapter?.hash;
    const files = json.chapter?.data || [];
    return files.map((file) => `${baseUrl}/data/${hash}/${file}`);
  } catch {
    return [];
  }
}

async function resolvePagesForSeries(seriesSlugOrTitle, limit = 50) {
  console.log(`=== Resolving Pages for [${seriesSlugOrTitle}] ===`);

  // 1. Find series
  const { data: seriesList } = await supabase
    .from('series')
    .select('id, title')
    .or(`slug.eq.${seriesSlugOrTitle},title.ilike.%${seriesSlugOrTitle}%`)
    .limit(1);

  if (!seriesList || seriesList.length === 0) {
    console.error('Series not found.');
    return;
  }

  const series = seriesList[0];
  console.log(`Found: ${series.title} (${series.id})`);

  // 2. Find placeholder chapters for this series
  const { data: chapters, error } = await supabase
    .from('chapters')
    .select('id, chapter_number, source, external_id, pages')
    .eq('series_id', series.id)
    .order('chapter_number', { ascending: true });

  if (error || !chapters) {
    console.error('Failed to query chapters:', error?.message);
    return;
  }

  const unresolved = chapters.filter(
    (c) => !c.pages || c.pages.length <= 1 || c.pages[0] === c.external_id
  );

  console.log(`Found ${unresolved.length} unresolved chapters. Processing first ${limit}...`);

  let resolvedCount = 0;

  for (const ch of unresolved.slice(0, limit)) {
    let realPages = [];

    try {
      if (ch.source === 'mangadex') {
        realPages = await fetchMangaDexPages(ch.external_id);
      } else if (ch.source === 'mangapill' && ch.external_id) {
        const html = await fetchHtml(ch.external_id);
        realPages = parseMangapillPages(html);
      }
    } catch (err) {
      console.warn(`Failed extracting Ch. ${ch.chapter_number}:`, err.message);
    }

    if (realPages.length > 0) {
      const { error: updateErr } = await supabase
        .from('chapters')
        .update({ pages: realPages })
        .eq('id', ch.id);

      if (!updateErr) {
        resolvedCount++;
        console.log(`-> Ch. ${ch.chapter_number}: saved ${realPages.length} images`);
      }
    } else {
      console.warn(`-> Ch. ${ch.chapter_number}: no images found`);
    }

    await sleep(250);
  }

  console.log(`\n=== Finished: ${resolvedCount} chapters fully resolved with real images ===`);
}

// Pass series slug/title and batch limit via CLI arguments:
// e.g.: node scripts/resolve-pages.js "Komi" 50
const targetName = process.argv[2] || 'Komi';
const batchLimit = parseInt(process.argv[3], 10) || 100;

resolvePagesForSeries(targetName, batchLimit);
