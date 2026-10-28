// scripts/sync-multi-source.js
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
  console.error('[Fatal] Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchWithRetry(url, isJson = false, extraHeaders = {}, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url, { 
        headers: { ...BROWSER_HEADERS, ...extraHeaders } 
      });
      if (res.status === 429) {
        await sleep(2500 * i);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return isJson ? await res.json() : await res.text();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(1000 * i);
    }
  }
}

function isSlugMatch(targetUrl, seriesSlug, seriesTitle) {
  if (!targetUrl) return true;
  const cleanUrl = targetUrl.toLowerCase();
  const baseSlug = seriesSlug ? seriesSlug.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const firstWord = (seriesTitle || '').toLowerCase().split(/[\s:_-]+/)[0].replace(/[^a-z0-9]/g, '');

  const knownCollisions = ['one-piece', 'naruto', 'bleach', 'martial-peak', 'detective-conan'];
  for (const known of knownCollisions) {
    const rawKnown = known.replace('-', '');
    if (cleanUrl.includes(known) && !baseSlug.includes(rawKnown) && !firstWord.includes(rawKnown)) {
      return false;
    }
  }
  return true;
}

// 1. MangaDex (Official API)
async function fetchMangaDex(dexId) {
  const chapters = [];
  let offset = 0;
  const limit = 100;
  let total = 1;

  while (offset < total && offset < 1000) {
    const url = `https://api.mangadex.org/chapter?manga=${dexId}&translatedLanguage[]=en&limit=${limit}&offset=${offset}&order[chapter]=asc`;
    const json = await fetchWithRetry(url, true);
    if (!json?.data?.length) break;

    total = json.total || 0;
    for (const c of json.data) {
      const num = parseFloat(c.attributes.chapter);
      if (!isNaN(num)) {
        chapters.push({
          chapter_number: num,
          title: c.attributes.title || `Chapter ${num}`,
          external_id: c.id,
          source: 'mangadex',
          pages: [c.id]
        });
      }
    }
    offset += limit;
    await sleep(200);
  }
  return chapters;
}

// 2. MangaPill (Primary Unblocked Aggregator)
async function fetchMangaPill(url, seriesSlug, seriesTitle) {
  const html = await fetchWithRetry(url, false);
  const $ = cheerio.load(html);

  const pageTitle = $('h1').first().text().trim().toLowerCase();
  const knownCollisions = ['one piece', 'naruto', 'bleach', 'detective conan'];
  const targetLower = (seriesTitle || '').toLowerCase();
  
  for (const collision of knownCollisions) {
    if (pageTitle.includes(collision) && !targetLower.includes(collision)) {
      console.warn(`[Safety Block] Cross-franchise collision detected! Target: "${seriesTitle}", Page H1: "${pageTitle}". Skipping.`);
      return [];
    }
  }

  const chaptersMap = new Map();

  $('div[id*="chapters"] a[href*="/chapters/"], #chapters a, .chapters-list a, a[href*="/chapters/"]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (!href) return;

    const fullUrl = href.startsWith('http') ? href : `https://mangapill.com${href}`;

    if (!isSlugMatch(fullUrl, seriesSlug, seriesTitle)) return;

    let num = null;
    const textMatch = text.match(/(?:chapter|ch\.?)\s*([\d.]+)/i);
    if (textMatch) {
      num = parseFloat(textMatch[1]);
    } else {
      const slugMatch = href.match(/chapter-([\d.]+)(?:[^\d]|$)/i);
      if (slugMatch) {
        num = parseFloat(slugMatch[1]);
      }
    }

    if (num !== null && !isNaN(num) && num >= 0) {
      if (!chaptersMap.has(num)) {
        chaptersMap.set(num, {
          chapter_number: num,
          title: text.replace(/\s+/g, ' ').trim() || `Chapter ${num}`,
          external_id: fullUrl,
          source: 'mangapill',
          pages: [fullUrl]
        });
      }
    }
  });

  return Array.from(chaptersMap.values()).sort((a, b) => a.chapter_number - b.chapter_number);
}

// 3. Manhwatop Fallback (Madara Theme - Item #16)
async function fetchManhwatop(slug) {
  try {
    const cleanSlug = slug.replace(/^https?:\/\/[^\/]+\/manga\//, '').replace(/\/$/, '');
    const url = `https://manhwatop.com/manga/${cleanSlug}/`;
    
    const html = await fetchWithRetry(url, false, {
      'Referer': 'https://manhwatop.com/',
    });

    if (!html) return [];
    const $ = cheerio.load(html);
    const chapters = [];

    $('li.wp-manga-chapter a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (!href || !href.includes('/chapter-')) return;

      const match = text.match(/(?:chapter|ch\.?)\s*([\d.]+)/i) || href.match(/chapter-([\d.]+)/i);
      const num = match ? parseFloat(match[1]) : null;

      if (num !== null && !isNaN(num)) {
        chapters.push({
          chapter_number: num,
          title: text.replace(/\s+/g, ' ').trim() || `Chapter ${num}`,
          external_id: href,
          source: 'manhwatop',
          pages: [href]
        });
      }
    });

    return chapters.sort((a, b) => a.chapter_number - b.chapter_number);
  } catch (err) {
    return [];
  }
}

async function runSynchronizer() {
  console.log('=== Starting MangaFlow High-Speed Synchronizer ===');

  const { data: queue, error: qErr } = await supabase
    .from('v_automated_sync_queue')
    .select('*')
    .limit(45);

  if (qErr || !queue?.length) {
    console.log('Queue empty or error:', qErr?.message);
    return;
  }

  console.log(`Processing ${queue.length} target series from queue...`);
  let totalAdded = 0;

  for (const item of queue) {
    const { series_id, title, slug, source_platform, target_url, target_identifier } = item;

    const { data: existing } = await supabase
      .from('chapters')
      .select('chapter_number')
      .eq('series_id', series_id);

    const existingSet = new Set((existing || []).map((c) => Number(c.chapter_number)));
    let remoteChapters = [];

    // Tier 1 & 2: Primary Scraping
    try {
      if (source_platform === 'mangadex' && (target_identifier || target_url)) {
        const dexId = target_identifier || target_url.split('/').pop();
        remoteChapters = await fetchMangaDex(dexId);
      } else if (source_platform === 'mangapill' && target_url) {
        remoteChapters = await fetchMangaPill(target_url, slug, title);
      }
    } catch (err) {
      console.warn(`[Primary Failed] ${title}: ${err.message}`);
    }

    // Tier 3: Manhwatop Fallback (Activates if primary returned <= 15 teaser chapters)
    if (remoteChapters.length <= 15 && title) {
      const fallbackSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const fallbackChapters = await fetchManhwatop(fallbackSlug);
      if (fallbackChapters.length > remoteChapters.length) {
        console.log(`[Manhwatop Fallback Used] ${title}: Found ${fallbackChapters.length} chapters`);
        remoteChapters = fallbackChapters;
      }
    }

    console.log(`[Scan Result] ${title}: Found ${remoteChapters.length} remote chapters`);

    const missing = remoteChapters.filter((rc) => !existingSet.has(Number(rc.chapter_number)));

    if (missing.length === 0) {
      await supabase
        .from('series_intel')
        .update({ last_scouted_at: new Date().toISOString() })
        .eq('series_id', series_id);
      continue;
    }

    console.log(`-> ${title}: Ingesting ${missing.length} missing chapters...`);

    const dedupedMap = new Map();
    for (const ch of missing) {
      if (!dedupedMap.has(ch.chapter_number)) {
        dedupedMap.set(ch.chapter_number, {
          series_id,
          chapter_number: ch.chapter_number,
          title: ch.title,
          source: ch.source,
          external_id: ch.external_id,
          pages: ch.pages
        });
      }
    }

    const payload = Array.from(dedupedMap.values());

    for (let i = 0; i < payload.length; i += 150) {
      const batch = payload.slice(i, i + 150);
      const { error: insErr } = await supabase
        .from('chapters')
        .upsert(batch, { onConflict: 'series_id,chapter_number' });

      if (insErr) {
        console.error(`Error inserting batch for ${title}:`, insErr.message);
      } else {
        totalAdded += batch.length;
      }
    }

    const maxRemote = Math.max(...remoteChapters.map((c) => c.chapter_number));
    await supabase
      .from('series_intel')
      .update({
        latest_known_chapter: maxRemote,
        last_scouted_at: new Date().toISOString()
      })
      .eq('series_id', series_id);

    await sleep(200);
  }

  console.log(`\n=== Finished Ingestion: Successfully inserted ${totalAdded} chapters! ===`);
}

runSynchronizer();
