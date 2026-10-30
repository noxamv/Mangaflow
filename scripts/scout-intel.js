// scripts/scout-intel.js
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocket {};
}

import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[FATAL] Missing Supabase credentials in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanTitle(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function scoutWeebCentral(title) {
  try {
    const searchUrl = `https://weebcentral.com/search/data?limit=12&offset=0&text=${encodeURIComponent(
      cleanTitle(title)
    )}&sort=Best+Match&order=Ascending&official=Any`;

    const res = await fetch(searchUrl, {
      method: 'GET',
      headers: { ...HEADERS, 'HX-Request': 'true', Referer: 'https://weebcentral.com/search' }
    });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    const link = $('a[href*="/series/"]').first().attr('href');
    if (!link) return null;

    const fullUrl = link.startsWith('http') ? link : `https://weebcentral.com${link}`;
    const seriesId = link.match(/series\/([a-zA-Z0-9_-]+)/)?.[1] || fullUrl;

    return { platform: 'weebcentral', url: fullUrl, identifier: seriesId };
  } catch {
    return null;
  }
}

async function scoutComick(title) {
  const domains = ['https://api.comick.dev', 'https://api.comick.io', 'https://api.comick.cc'];

  for (const base of domains) {
    try {
      const res = await fetch(`${base}/v1.0/search?q=${encodeURIComponent(cleanTitle(title))}&limit=1`, {
        headers: { ...HEADERS, Referer: 'https://comick.dev/' }
      });
      if (!res.ok) continue;

      const data = await res.json();
      const comic = Array.isArray(data) ? data[0] : null;
      if (!comic?.hid) continue;

      return {
        platform: 'comick',
        url: `https://comick.dev/comic/${comic.slug || comic.hid}`,
        identifier: comic.hid
      };
    } catch {}
  }
  return null;
}

async function scoutMangaPill(title) {
  try {
    const res = await fetch(`https://mangapill.com/search?q=${encodeURIComponent(cleanTitle(title))}`, {
      headers: HEADERS
    });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    const link = $('a[href*="/manga/"]').first().attr('href');
    if (!link) return null;

    const fullUrl = link.startsWith('http') ? link : `https://mangapill.com${link}`;
    const slug = fullUrl.split('/').filter(Boolean).pop();

    return { platform: 'mangapill', url: fullUrl, identifier: slug };
  } catch {
    return null;
  }
}

async function scoutMangaDex(title) {
  try {
    const query = encodeURIComponent(cleanTitle(title));
    const res = await fetch(
      `https://api.mangadex.org/manga?title=${query}&limit=5&order[relevance]=desc`,
      { headers: { 'User-Agent': HEADERS['User-Agent'] } }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const hits = data.data || [];

    for (const manga of hits) {
      const enTitle = manga.attributes?.title?.en || Object.values(manga.attributes?.title || {})[0] || '';
      const cleanTarget = cleanTitle(title);
      const cleanFound = cleanTitle(enTitle);

      if (cleanFound.includes(cleanTarget) || cleanTarget.includes(cleanFound)) {
        return {
          platform: 'mangadex',
          url: `https://mangadex.org/title/${manga.id}`,
          identifier: manga.id
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('--- RUNNING ENHANCED MULTI-SOURCE SCOUT INTEL ---');

  const { data: queue, error } = await supabase
    .from('series')
    .select(`
      id, 
      title, 
      reading_mode,
      series_intel(source_platform, target_url, latest_known_chapter),
      chapters(count)
    `)
    .or('target_url.is.null,target_url.eq.placeholder,source_platform.eq.unassigned,latest_known_chapter.eq.0', {
      foreignTable: 'series_intel'
    })
    .limit(50);

  if (error || !queue) {
    console.error('[Queue Error]:', error?.message);
    process.exit(1);
  }

  console.log(`Found ${queue.length} unassigned/unlinked titles to scout.`);

  for (const item of queue) {
    const intel = Array.isArray(item.series_intel) ? item.series_intel[0] : item.series_intel;
    const existingCount = item.chapters?.[0]?.count || 0;
    const existingUrl = intel?.target_url;

    if (existingCount > 30 && existingUrl && existingUrl !== 'placeholder' && intel?.source_platform !== 'unassigned') {
      console.log(`[SKIP] "${item.title}" already verified with ${existingCount} chapters.`);
      continue;
    }

    console.log(`Scouting source for: "${item.title}"...`);

    const isWebtoon =
      item.reading_mode === 'webtoon' ||
      item.title.toLowerCase().includes('leveling') ||
      item.title.toLowerCase().includes('villainess');

    let match = null;

    if (isWebtoon) {
      match = await scoutWeebCentral(item.title);
      if (!match) {
        await delay(250);
        match = await scoutComick(item.title);
      }
      if (!match) {
        await delay(250);
        match = await scoutMangaPill(item.title);
      }
      if (!match) {
        await delay(250);
        match = await scoutMangaDex(item.title);
      }
    } else {
      match = await scoutMangaPill(item.title);
      if (!match) {
        await delay(250);
        match = await scoutMangaDex(item.title);
      }
      if (!match) {
        await delay(250);
        match = await scoutWeebCentral(item.title);
      }
      if (!match) {
        await delay(250);
        match = await scoutComick(item.title);
      }
    }

    if (match) {
      console.log(`  -> RESOLVED: [${match.platform}] => ${match.url}`);
      await supabase.from('series_intel').upsert(
        {
          series_id: item.id,
          source_platform: match.platform,
          target_url: match.url,
          target_identifier: match.identifier,
          last_scouted_at: new Date().toISOString()
        },
        { onConflict: 'series_id' }
      );
    } else {
      console.log(`  -> [NOT FOUND] Marked scout attempt timestamp.`);
      await supabase.from('series_intel').upsert(
        {
          series_id: item.id,
          last_scouted_at: new Date().toISOString()
        },
        { onConflict: 'series_id' }
      );
    }

    await delay(500);
  }

  console.log('--- SCOUTING COMPLETE ---');
}

main().catch(console.error);
