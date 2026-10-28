// scripts/scout-intel.js
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
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
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

async function scoutMangaDexLatest(dexId) {
  try {
    const url = `https://api.mangadex.org/chapter?manga=${dexId}&translatedLanguage[]=en&limit=1&order[chapter]=desc`;
    const json = await fetchWithRetry(url, true);
    if (json?.data?.length > 0) {
      const num = parseFloat(json.data[0].attributes.chapter);
      return isNaN(num) ? null : num;
    }
  } catch (err) {
    // Silent ignore to allow fallbacks
  }
  return null;
}

async function scoutMangaPillLatest(targetUrl, seriesTitle) {
  try {
    const html = await fetchWithRetry(targetUrl, false);
    const $ = cheerio.load(html);

    const pageTitle = $('h1').first().text().trim().toLowerCase();
    const knownCollisions = ['one piece', 'naruto', 'bleach', 'detective conan'];
    const targetLower = (seriesTitle || '').toLowerCase();
    
    for (const collision of knownCollisions) {
      if (pageTitle.includes(collision) && !targetLower.includes(collision)) {
        return null;
      }
    }

    let maxNum = null;
    $('div[id*="chapters"] a[href*="/chapters/"], #chapters a, .chapters-list a, a[href*="/chapters/"]').slice(0, 20).each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();

      const textMatch = text.match(/(?:chapter|ch\.?)\s*([\d.]+)/i);
      const slugMatch = href.match(/chapter-([\d.]+)(?:[^\d]|$)/i);
      const num = textMatch ? parseFloat(textMatch[1]) : (slugMatch ? parseFloat(slugMatch[1]) : null);

      if (num !== null && !isNaN(num)) {
        if (maxNum === null || num > maxNum) {
          maxNum = num;
        }
      }
    });

    return maxNum;
  } catch (err) {
    return null;
  }
}

async function scoutComicKLatest(comicSlug) {
  try {
    const comicInfo = await fetchWithRetry(`https://api.comick.fun/comic/${comicSlug}`, true);
    const hid = comicInfo?.comic?.hid;
    if (!hid) return null;

    const url = `https://api.comick.fun/comic/${hid}/chapters?lang=en&page=1&limit=1`;
    const data = await fetchWithRetry(url, true);
    const first = data?.chapters?.[0];
    if (first && first.chap) {
      const num = parseFloat(first.chap);
      return isNaN(num) ? null : num;
    }
  } catch (err) {
    return null;
  }
  return null;
}

async function runScout() {
  console.log('=== Running Round-Robin Scout Worker ===');

  const { data: targets, error } = await supabase
    .from('v_automated_sync_queue')
    .select('series_id, title, slug, source_platform, target_url, target_identifier, comick_hid, upstream_latest')
    .order('is_release_today', { ascending: false })
    .order('last_scouted_at', { ascending: true, nullsFirst: true })
    .limit(80);

  if (error || !targets?.length) {
    console.log('No targets to scout or error:', error?.message);
    return;
  }

  console.log(`Scouting ${targets.length} series...`);

  for (const item of targets) {
    const { series_id, title, source_platform, target_url, target_identifier, comick_hid, upstream_latest } = item;
    const currentCeiling = Number(upstream_latest) || 0;
    let discovered = null;

    if (source_platform === 'mangadex' && (target_identifier || target_url)) {
      const dexId = target_identifier || target_url.split('/').pop();
      discovered = await scoutMangaDexLatest(dexId);
    } else if (source_platform === 'mangapill' && target_url) {
      discovered = await scoutMangaPillLatest(target_url, title);
    }

    if (!discovered && (comick_hid || title)) {
      const fallbackSlug = comick_hid || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      discovered = await scoutComicKLatest(fallbackSlug);
    }

    if (discovered !== null && !isNaN(discovered)) {
      // Guard: Block abnormal chapter leaps (>30 above known ceiling for established series)
      if (currentCeiling > 50 && discovered > currentCeiling + 30) {
        console.warn(`[Scout Anomaly Blocked] ${title}: Detected Ch. ${discovered} exceeds known ceiling ${currentCeiling} by >30. Skipping.`);
        await supabase
          .from('series_intel')
          .update({ last_scouted_at: new Date().toISOString() })
          .eq('series_id', series_id);
        continue;
      }

      if (discovered > currentCeiling) {
        console.log(`[New Release/Epilogue Detected] ${title} -> Ch. ${discovered} (was ${currentCeiling})`);
        await supabase
          .from('series_intel')
          .update({
            latest_known_chapter: discovered,
            last_scouted_at: new Date().toISOString()
          })
          .eq('series_id', series_id);
      } else {
        await supabase
          .from('series_intel')
          .update({ last_scouted_at: new Date().toISOString() })
          .eq('series_id', series_id);
      }
    } else {
      await supabase
        .from('series_intel')
        .update({ last_scouted_at: new Date().toISOString() })
        .eq('series_id', series_id);
    }

    await sleep(200);
  }

  console.log('=== Round-Robin Scout Finished ===');
}

runScout();
