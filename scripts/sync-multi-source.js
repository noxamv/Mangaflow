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

async function fetchWithRetry(url, isJson = false, extraHeaders = {}, retries = 2) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url, { 
        headers: { ...BROWSER_HEADERS, ...extraHeaders } 
      });
      if (res.status === 404) {
        // Return null immediately on 404 to avoid redundant retries
        return null;
      }
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
  return null;
}

// 1. Dynamic MangaPill URL Resolver
async function resolveMangaPillUrl(seriesTitle) {
  try {
    const cleanQuery = encodeURIComponent(
      seriesTitle.replace(/[^a-zA-Z0-9\s]/g, '').trim()
    );
    const searchUrl = `https://mangapill.com/search?q=${cleanQuery}`;
    const html = await fetchWithRetry(searchUrl, false);
    if (!html) return null;

    const $ = cheerio.load(html);
    let matchedUrl = null;
    const targetClean = seriesTitle.toLowerCase().replace(/[^a-z0-9]/g, '');

    $('a[href^="/manga/"]').each((_, el) => {
      if (matchedUrl) return;
      const titleText = $(el).find('div.leading-tight, .font-bold, h5').text().trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const href = $(el).attr('href');
      
      if (href && (titleText.includes(targetClean) || targetClean.includes(titleText))) {
        matchedUrl = href.startsWith('http') ? href : `https://mangapill.com${href}`;
      }
    });

    if (!matchedUrl) {
      const firstHref = $('a[href^="/manga/"]').first().attr('href');
      if (firstHref) {
        matchedUrl = firstHref.startsWith('http') ? firstHref : `https://mangapill.com${firstHref}`;
      }
    }

    return matchedUrl;
  } catch (err) {
    return null;
  }
}

// 2. MangaDex Ingestion
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

// 3. MangaPill Scraper
async function fetchMangaPill(url, seriesTitle) {
  try {
    const html = await fetchWithRetry(url, false);
    if (!html) return [];
    const $ = cheerio.load(html);

    const pageTitle = $('h1').first().text().trim().toLowerCase();
    const targetLower = (seriesTitle || '').toLowerCase();

    // Franchise collision prevention
    const knownCollisions = ['one piece', 'naruto', 'bleach', 'detective conan'];
    for (const collision of knownCollisions) {
      if (pageTitle.includes(collision) && !targetLower.includes(collision)) {
        console.warn(`[Safety Block] Franchise collision! Target: "${seriesTitle}", Page H1: "${pageTitle}". Skipping.`);
        return [];
      }
    }

    const chaptersMap = new Map();

    // Scan all chapter anchors in both the main list and container
    $('a[href*="/chapters/"]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (!href) return;

      const fullUrl = href.startsWith('http') ? href : `https://mangapill.com${href}`;

      let num = null;
      const textMatch = text.match(/(?:chapter|ch\.?)\s*([\d.]+)/i);
      if (textMatch) {
        num = parseFloat(textMatch[1]);
      } else {
        const urlMatch = href.match(/chapter-([\d.]+)(?:[^\d]|$)/i);
        if (urlMatch) {
          num = parseFloat(urlMatch[1]);
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
  } catch (err) {
    console.warn(`[MangaPill Error] ${seriesTitle}: ${err.message}`);
    return [];
  }
}

// 4. Manhwatop Fallback
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
    const { series_id, title, source_platform, target_url, target_identifier } = item;

    const { data: existing } = await supabase
      .from('chapters')
      .select('chapter_number')
      .eq('series_id', series_id);

    const existingSet = new Set((existing || []).map((c) => Number(c.chapter_number)));
    let remoteChapters = [];

    // TIER 1: MangaDex
    if (source_platform === 'mangadex' && (target_identifier || target_url)) {
      try {
        const dexId = target_identifier || target_url.split('/').pop();
        remoteChapters = await fetchMangaDex(dexId);
      } catch (err) {
        console.warn(`[MangaDex Failed] ${title}: ${err.message}`);
      }
    }

    // TIER 2: MangaPill
    if (remoteChapters.length <= 15) {
      let resolvedUrl = target_url && source_platform === 'mangapill' ? target_url : null;
      let pillChapters = [];

      // Try initial URL if provided
      if (resolvedUrl) {
        try {
          console.log(`[MangaPill Query] ${title} -> ${resolvedUrl}`);
          pillChapters = await fetchMangaPill(resolvedUrl, title);
        } catch (e) {
          pillChapters = [];
        }
      }

      // If initial target_url failed (404 or empty), dynamically search
      if (!pillChapters.length) {
        const searchedUrl = await resolveMangaPillUrl(title);
        if (searchedUrl && searchedUrl !== resolvedUrl) {
          console.log(`[MangaPill Auto-Search Found] ${title} -> ${searchedUrl}`);
          pillChapters = await fetchMangaPill(searchedUrl, title);
          if (pillChapters.length > 0) {
            resolvedUrl = searchedUrl;
            await supabase
              .from('series_intel')
              .update({ target_url: searchedUrl, source_platform: 'mangapill' })
              .eq('series_id', series_id);
          }
        }
      }

      if (pillChapters.length > remoteChapters.length) {
        remoteChapters = pillChapters;
      }
    }

    // TIER 3: Manhwatop Fallback
    if (remoteChapters.length <= 15 && title) {
      try {
        const fallbackSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const fallbackChapters = await fetchManhwatop(fallbackSlug);
        if (fallbackChapters.length > remoteChapters.length) {
          console.log(`[Manhwatop Fallback] ${title}: Found ${fallbackChapters.length} chapters`);
          remoteChapters = fallbackChapters;
        }
      } catch (e) {
        // Fallback error ignored safely
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
