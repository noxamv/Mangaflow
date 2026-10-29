// scripts/sync-multi-source.js
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocket {};
}

import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = 
  process.env.SUPABASE_URL || 
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_KEY = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_SERVICE_KEY || 
  process.env.SUPABASE_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-');
}

// ============================================================================
// 1. ADAPTERS
// ============================================================================

// COMICK API: Master Index for Asura, Reaper, Flame, HiveToon, and other scanlators
async function scrapeComick(seriesTitle) {
  try {
    const searchUrl = `https://api.comick.fun/v1.0/search?q=${encodeURIComponent(seriesTitle)}&limit=1`;
    const searchRes = await fetch(searchUrl, { headers: HEADERS });
    if (!searchRes.ok) return { chapters: [], platform: 'comick' };

    const searchJson = await searchRes.json();
    const comic = Array.isArray(searchJson) ? searchJson[0] : null;
    if (!comic?.hid) return { chapters: [], platform: 'comick' };

    let page = 1;
    let allChapters = [];
    let hasMore = true;

    // Paginate in safe batches of 100 up to 1000 chapters
    while (hasMore && page <= 10) {
      const chapUrl = `https://api.comick.fun/comic/${comic.hid}/chapters?lang=en&limit=100&page=${page}`;
      const chapRes = await fetch(chapUrl, { headers: HEADERS });
      if (!chapRes.ok) break;

      const chapJson = await chapRes.json();
      const items = chapJson.chapters || [];
      if (items.length === 0) break;

      for (const item of items) {
        const chNum = parseFloat(item.chap);
        if (!isNaN(chNum)) {
          allChapters.push({
            chapter_number: chNum,
            title: item.title ? `Chapter ${chNum} - ${item.title}` : `Chapter ${chNum}`,
            external_id: `comick:${item.hid}`,
            pages: [`https://comick.fun/chapter/${item.hid}`]
          });
        }
      }
      page++;
      await delay(150);
    }

    return { 
      chapters: allChapters, 
      resolvedUrl: `https://comick.io/comic/${comic.slug}`, 
      platform: 'comick' 
    };
  } catch (err) {
    return { chapters: [], platform: 'comick' };
  }
}

// HIVETOON & DIRECT MADARA SCANLATORS
async function scrapeHiveToon(seriesTitle) {
  try {
    const slug = slugify(seriesTitle);
    const candidateUrls = [
      `https://hivetoons.org/series/${slug}/`,
      `https://hivetoons.org/series/${slug}-series/`,
      `https://hivetoons.org/manga/${slug}/`
    ];

    for (const url of candidateUrls) {
      const res = await fetch(url, { headers: { ...HEADERS, Referer: 'https://hivetoons.org/' } });
      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);
      const chapters = [];

      $('.wp-manga-chapter a, li.wp-manga-chapter a, #chapterlist a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        const match = text.match(/chapter\s*([\d.]+)/i) || href?.match(/chapter-([\d.]+)/i);
        if (match && href) {
          const chNum = parseFloat(match[1]);
          if (!isNaN(chNum)) {
            chapters.push({
              chapter_number: chNum,
              title: text || `Chapter ${chNum}`,
              external_id: href,
              pages: [href]
            });
          }
        }
      });

      if (chapters.length > 0) {
        return { chapters, resolvedUrl: url, platform: 'hivetoons' };
      }
    }
  } catch {}
  return { chapters: [], platform: 'hivetoons' };
}

// MANGADEX API (Japanese Manga + Asian Comics)
async function scrapeMangaDex(targetUrl, seriesTitle) {
  let mangaId = null;
  if (targetUrl?.includes('mangadex.org/title/')) {
    mangaId = targetUrl.match(/title\/([a-f0-9-]+)/)?.[1];
  } else if (seriesTitle) {
    try {
      const search = await fetch(`https://api.mangadex.org/manga?title=${encodeURIComponent(seriesTitle)}&limit=1`, { headers: HEADERS });
      if (search.ok) {
        const json = await search.json();
        mangaId = json.data?.[0]?.id;
      }
    } catch {}
  }

  if (!mangaId) return { chapters: [], platform: 'mangadex' };

  let offset = 0;
  const limit = 100;
  let total = 100;
  const chapters = [];

  try {
    while (offset < total && offset < 1000) {
      const apiUrl = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=${limit}&offset=${offset}&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
      const res = await fetch(apiUrl, { headers: HEADERS });
      if (!res.ok) break;

      const json = await res.json();
      total = json.total || 0;
      const data = json.data || [];

      for (const item of data) {
        const chNum = parseFloat(item.attributes?.chapter);
        if (!isNaN(chNum)) {
          chapters.push({
            chapter_number: chNum,
            title: item.attributes?.title || `Chapter ${chNum}`,
            external_id: `mangadex:${item.id}`,
            pages: [`https://mangadex.org/chapter/${item.id}`]
          });
        }
      }
      offset += limit;
      await delay(200);
    }
  } catch {}

  return { chapters, resolvedUrl: `https://mangadex.org/title/${mangaId}`, platform: 'mangadex' };
}

// MANGAPILL (Japanese Manga & Classic Reader)
async function scrapeMangaPill(targetUrl, seriesTitle) {
  let url = targetUrl;
  if (!url || !url.includes('mangapill.com')) {
    try {
      const search = await fetch(`https://mangapill.com/search?q=${encodeURIComponent(seriesTitle)}`, { headers: HEADERS });
      if (search.ok) {
        const html = await search.text();
        const $ = cheerio.load(html);
        const href = $('a[href*="/manga/"]').first().attr('href');
        if (href) url = href.startsWith('http') ? href : `https://mangapill.com${href}`;
      }
    } catch {}
  }

  if (!url) return { chapters: [], platform: 'mangapill' };

  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return { chapters: [], platform: 'mangapill' };

    const html = await res.text();
    const $ = cheerio.load(html);
    const chapters = [];

    $('a[href*="/chapters/"], #chapters a, .chapters-list a, div.grid-cols-1 a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      const match = text.match(/chapter\s*([\d.]+)/i) || href?.match(/chapter-([\d.]+)/i);
      if (match && href) {
        const fullUrl = href.startsWith('http') ? href : `https://mangapill.com${href}`;
        const chNum = parseFloat(match[1]);
        if (!isNaN(chNum)) {
          chapters.push({
            chapter_number: chNum,
            title: text || `Chapter ${chNum}`,
            external_id: fullUrl,
            pages: [fullUrl]
          });
        }
      }
    });

    return { chapters, resolvedUrl: url, platform: 'mangapill' };
  } catch {
    return { chapters: [], platform: 'mangapill' };
  }
}

// ============================================================================
// 2. DUAL-LANE DISPATCHER
// ============================================================================

function isManhwaOrManhua(series) {
  // 1. Explicit database reading mode check
  if (series.reading_mode === 'webtoon' || series.reading_mode === 'vertical') {
    return true;
  }

  // 2. Title & genre heuristics (common Korean/Chinese titles or keywords)
  const t = (series.title || '').toLowerCase();
  const manhwaIndicators = [
    'solo', 'leveling', 'ranker', 'reincarnat', 'return of', 'regressor', 
    'villainess', 'player', 'dungeon', 'tower', 'necromancer', 'cultivat',
    'martial', 'murim', 'heavenly', 'sword', 'emperor', 'lookism', 'eleceed',
    'omniscient', 'magic emperor', 'tales of demons'
  ];

  return manhwaIndicators.some(keyword => t.includes(keyword));
}

async function resolveAndIngestSeries(series) {
  const intel = Array.isArray(series.series_intel) 
    ? (series.series_intel[0] || {}) 
    : (series.series_intel || {});

  const title = series.title;
  let targetUrl = intel.target_url;
  const isWebtoon = isManhwaOrManhua(series);

  console.log(`\nAuditing: "${title}" [Lane: ${isWebtoon ? '🇰🇷/🇨🇳 MANHWA & MANHUA' : '🇯🇵 MANGA'}]`);

  let result = { chapters: [], resolvedUrl: targetUrl, platform: '' };

  if (isWebtoon) {
    // LANE A: MANHWA / MANHUA
    // 1. Scans aggregator (Comick: covers Asura, Reaper, Flame, HiveToon)
    result = await scrapeComick(title);

    // 2. Direct HiveToon / Madara scans fallback
    if (result.chapters.length === 0) {
      result = await scrapeHiveToon(title);
    }

    // 3. MangaDex API fallback
    if (result.chapters.length === 0) {
      result = await scrapeMangaDex(targetUrl, title);
    }

    // 4. MangaPill (Last-resort fallback)
    if (result.chapters.length === 0) {
      result = await scrapeMangaPill(targetUrl, title);
    }
  } else {
    // LANE B: JAPANESE MANGA
    // 1. MangaDex API (Gold standard for manga metadata & clean chapters)
    result = await scrapeMangaDex(targetUrl, title);

    // 2. MangaPill (Primary static mirror for manga)
    if (result.chapters.length === 0) {
      result = await scrapeMangaPill(targetUrl, title);
    }

    // 3. Comick fallback
    if (result.chapters.length === 0) {
      result = await scrapeComick(title);
    }
  }

  if (result.chapters.length === 0) {
    console.log(`  [FAILED] No chapters found in either lane for "${title}".`);
    await supabase.from('series_intel').update({ last_scouted_at: new Date().toISOString() }).eq('series_id', series.id);
    return;
  }

  // Deduplicate and upsert
  const uniqueMap = new Map();
  for (const ch of result.chapters) {
    if (!uniqueMap.has(ch.chapter_number)) {
      uniqueMap.set(ch.chapter_number, {
        series_id: series.id,
        chapter_number: ch.chapter_number,
        title: ch.title,
        external_id: ch.external_id,
        pages: ch.pages,
        source: result.platform,
        updated_at: new Date().toISOString()
      });
    }
  }

  const payload = Array.from(uniqueMap.values());
  const maxCh = Math.max(...payload.map((c) => c.chapter_number));

  console.log(`  -> Found ${payload.length} chapters (Max: Ch. ${maxCh}) via [${result.platform}]. Saving...`);

  // Upsert in batches of 200
  const CHUNK_SIZE = 200;
  for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
    const chunk = payload.slice(i, i + CHUNK_SIZE);
    await supabase.from('chapters').upsert(chunk, { onConflict: 'series_id, chapter_number' });
  }

  await supabase
    .from('series_intel')
    .update({
      source_platform: result.platform,
      target_url: result.resolvedUrl || targetUrl || '',
      latest_known_chapter: maxCh,
      last_scouted_at: new Date().toISOString()
    })
    .eq('series_id', series.id);

  console.log(`  [SUCCESS] ${title} updated.`);
}

async function main() {
  console.log('--- STARTING LANE-BASED MULTI-SOURCE SYNC ---');

  const { data: queue, error } = await supabase
    .from('series')
    .select('id, title, reading_mode, series_intel(source_platform, target_url, last_scouted_at)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error || !queue) {
    console.error('Failed to fetch queue:', error?.message);
    process.exit(1);
  }

  console.log(`Processing ${queue.length} series through dual-lane routing...`);

  for (const series of queue) {
    await resolveAndIngestSeries(series);
    await delay(1200);
  }

  console.log('--- SYNC FINISHED ---');
}

main().catch(console.error);
