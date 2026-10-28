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
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
    await sleep(120);
  }
  return chapters;
}

async function sync() {
  console.log('=== High-Throughput Deficit Ingestion Starting ===');

  // Pulls top 40 series with the largest missing chapter gaps from the live view
  const { data: targets, error } = await supabase
    .from('v_automated_sync_queue')
    .select('intel_id, series_id, title, source_platform, target_url, target_identifier, missing_gap')
    .gt('missing_gap', 0)
    .limit(40);

  if (error || !targets) {
    console.error('Failed to query automated sync queue:', error?.message);
    return;
  }

  let totalIngestedThisRun = 0;

  for (const item of targets) {
    const seriesId = item.series_id;
    const title = item.title;

    // 1. Fetch existing chapters
    const { data: existingRows } = await supabase
      .from('chapters')
      .select('chapter_number')
      .eq('series_id', seriesId);

    const existingSet = new Set((existingRows || []).map((r) => Number(r.chapter_number)));

    // 2. Fetch remote chapters
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
      console.warn(`[Skip] Failed fetching ${title}:`, err.message);
      continue;
    }

    // 3. Deduplicate
    const missing = remoteChapters.filter((rc) => !existingSet.has(rc.chapter_number));
    if (missing.length === 0) continue;

    console.log(`[Ingesting] ${title}: adding ${missing.length} missing chapters...`);

    // 4. Batch upsert in chunks of 200
    const BATCH = 200;
    for (let i = 0; i < missing.length; i += BATCH) {
      const chunk = missing.slice(i, i + BATCH).map((c) => ({
        series_id: seriesId,
        chapter_number: c.chapter_number,
        title: c.title,
        source: item.source_platform,
        source_provider: item.source_platform,
        external_id: c.external_id,
        pages: [c.external_id]
      }));

      const { error: insertErr } = await supabase
        .from('chapters')
        .upsert(chunk, { onConflict: 'series_id,chapter_number' });

      if (!insertErr) {
        totalIngestedThisRun += chunk.length;
      } else {
        console.error(`Insert failed for ${title}:`, insertErr.message);
      }
      await sleep(100);
    }
  }

  console.log(`\n=== Ingestion Pass Finished: Total ${totalIngestedThisRun} chapters added ===`);
}

sync();
