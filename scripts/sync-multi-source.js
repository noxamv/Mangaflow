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
// 1. PRE-FLIGHT UPSTREAM TEST
// ============================================================================
async function runPreflightHealthCheck() {
  console.log('\n--- UPSTREAM SOURCE ACCESSIBILITY TEST ---');
  const testEndpoints = [
    { name: 'MangaDex API', url: 'https://api.mangadex.org/ping' },
    { name: 'MangaPill Web', url: 'https://mangapill.com' },
    { name: 'Comick API', url: 'https://api.comick.fun/v1.0/search?q=lookism&limit=1' },
    { name: 'WeebCentral Web', url: 'https://weebcentral.com/search/data?author=&text=lookism' },
    { name: 'MangaFire Web', url: 'https://mangafire.to/filter?keyword=lookism' }
  ];

  for (const endpoint of testEndpoints) {
    try {
      const res = await fetch(endpoint.url, { headers: HEADERS, redirect: 'follow' });
      if (res.ok) {
        console.log(`  [OK - HTTP ${res.status}] ${endpoint.name} is accessible.`);
      } else {
        console.log(`  [BLOCKED/ERROR - HTTP ${res.status}] ${endpoint.name} returned an error.`);
      }
    } catch (err) {
      console.log(`  [FAILED] ${endpoint.name}: ${err.message}`);
    }
  }
  console.log('-------------------------------------------\n');
}

// ============================================================================
// 2. COMICK CLEAN API (Lookism, Eleceed, ORV, Tomb Raider King)
// ============================================================================
async function scrapeComickClean(seriesTitle) {
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
  } catch {
    return { chapters: [], platform: 'comick' };
  }
}

// ============================================================================
// 3. MANGAPILL (With Title Search Fallback on 404)
// ============================================================================
async function scrapeMangaPill(targetUrl, seriesTitle) {
  let url = targetUrl && targetUrl.includes('mangapill.com') ? targetUrl : null;

  async function fetchChaptersFromUrl(pageUrl) {
    try {
      const res = await fetch(pageUrl, { headers: HEADERS });
      if (!res.ok) return [];

      const html = await res.text();
      const $ = cheerio.load(html);
      const chaps = [];

      $('a[href*="/chapters/"], #chapters a, .chapters-list a, div.grid-cols-1 a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        const match = text.match(/chapter\s*([\d.]+)/i) || href?.match(/chapter-([\d.]+)/i);
        if (match && href) {
          const fullUrl = href.startsWith('http') ? href : `https://mangapill.com${href}`;
          const chNum = parseFloat(match[1]);
          if (!isNaN(chNum)) {
            chaps.push({
              chapter_number: chNum,
              title: text || `Chapter ${chNum}`,
              external_id: fullUrl,
              pages: [fullUrl]
            });
          }
        }
      });
      return chaps;
    } catch {
      return [];
    }
  }

  let chapters = [];
  if (url) {
    chapters = await fetchChaptersFromUrl(url);
  }

  if (chapters.length === 0 && seriesTitle) {
    try {
      const search = await fetch(`https://mangapill.com/search?q=${encodeURIComponent(seriesTitle)}`, { headers: HEADERS });
      if (search.ok) {
        const html = await search.text();
        const $ = cheerio.load(html);
        const href = $('a[href*="/manga/"]').first().attr('href');
        if (href) {
          url = href.startsWith('http') ? href : `https://mangapill.com${href}`;
          chapters = await fetchChaptersFromUrl(url);
        }
      }
    } catch {}
  }

  return { chapters, resolvedUrl: url, platform: 'mangapill' };
}

// ============================================================================
// 4. WEEBCENTRAL ADAPTER
// ============================================================================
async function scrapeWeebCentral(seriesTitle) {
  try {
    const searchUrl = `https://weebcentral.com/search/data?author=&text=${encodeURIComponent(seriesTitle)}`;
    const searchRes = await fetch(searchUrl, { headers: HEADERS });
    if (!searchRes.ok) return { chapters: [], platform: 'weebcentral' };

    const searchHtml = await searchRes.text();
    const $ = cheerio.load(searchHtml);
    const link = $('a[href*="/series/"]').first().attr('href');
    if (!link) return { chapters: [], platform: 'weebcentral' };

    const seriesUrl = link.startsWith('http') ? link : `https://weebcentral.com${link}`;
    const seriesId = link.match(/series\/([a-zA-Z0-9_-]+)/)?.[1];
    if (!seriesId) return { chapters: [], platform: 'weebcentral' };

    const chapsUrl = `https://weebcentral.com/series/${seriesId}/full-chapter-list`;
    const chapsRes = await fetch(chapsUrl, { headers: HEADERS });
    if (!chapsRes.ok) return { chapters: [], platform: 'weebcentral' };

    const chapsHtml = await chapsRes.text();
    const $c = cheerio.load(chapsHtml);
    const chapters = [];

    $c('a[href*="/chapters/"]').each((_, el) => {
      const href = $c(el).attr('href');
      const text = $c(el).text().trim();
      const match = text.match(/chapter\s*([\d.]+)/i) || href?.match(/chapter-([\d.]+)/i);
      if (match && href) {
        const fullUrl = href.startsWith('http') ? href : `https://weebcentral.com${href}`;
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

    if (chapters.length > 0) {
      return { chapters, resolvedUrl: seriesUrl, platform: 'weebcentral' };
    }
  } catch {}
  return { chapters: [], platform: 'weebcentral' };
}

// ============================================================================
// 5. MANGAFIRE ADAPTER
// ============================================================================
async function scrapeMangaFire(seriesTitle) {
  try {
    const searchUrl = `https://mangafire.to/filter?keyword=${encodeURIComponent(seriesTitle)}`;
    const searchRes = await fetch(searchUrl, { headers: HEADERS });
    if (!searchRes.ok) return { chapters: [], platform: 'mangafire' };

    const searchHtml = await searchRes.text();
    const $ = cheerio.load(searchHtml);
    const href = $('.original.card-lg .inner a, .unit .inner a').first().attr('href');
    if (!href) return { chapters: [], platform: 'mangafire' };

    const seriesUrl = href.startsWith('http') ? href : `https://mangafire.to${href}`;
    const res = await fetch(seriesUrl, { headers: HEADERS });
    if (!res.ok) return { chapters: [], platform: 'mangafire' };

    const pageHtml = await res.text();
    const $p = cheerio.load(pageHtml);
    const chapters = [];

    $p('.chapter-list li a, ul.scroll-sm li a').each((_, el) => {
      const chHref = $p(el).attr('href');
      const text = $p(el).text().trim();
      const match = text.match(/chapter\s*([\d.]+)/i) || chHref?.match(/chapter-([\d.]+)/i);
      if (match && chHref) {
        const fullUrl = chHref.startsWith('http') ? chHref : `https://mangafire.to${chHref}`;
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

    if (chapters.length > 0) {
      return { chapters, resolvedUrl: seriesUrl, platform: 'mangafire' };
    }
  } catch {}
  return { chapters: [], platform: 'mangafire' };
}

// ============================================================================
// 6. MANGADEX API
// ============================================================================
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

// ============================================================================
// 7. ROUTING & INGESTION
// ============================================================================
function isManhwaOrManhua(series) {
  if (series.reading_mode === 'webtoon' || series.reading_mode === 'vertical') {
    return true;
  }
  const t = (series.title || '').toLowerCase();
  const manhwaIndicators = [
    'solo', 'leveling', 'ranker', 'reincarnat', 'return of', 'regressor', 
    'villainess', 'player', 'dungeon', 'tower', 'necromancer', 'cultivat',
    'martial', 'murim', 'heavenly', 'sword', 'emperor', 'lookism', 'eleceed',
    'omniscient', 'taming master', 'tomb raider king', "priscilla's marriage request"
  ];
  return manhwaIndicators.some(k => t.includes(k));
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
    result = await scrapeComickClean(title);
    if (result.chapters.length === 0) result = await scrapeWeebCentral(title);
    if (result.chapters.length === 0) result = await scrapeMangaFire(title);
    if (result.chapters.length === 0) result = await scrapeMangaPill(targetUrl, title);
    if (result.chapters.length === 0) result = await scrapeMangaDex(targetUrl, title);
  } else {
    result = await scrapeMangaPill(targetUrl, title);
    if (result.chapters.length === 0) result = await scrapeMangaDex(targetUrl, title);
    if (result.chapters.length === 0) result = await scrapeWeebCentral(title);
    if (result.chapters.length === 0) result = await scrapeMangaFire(title);
    if (result.chapters.length === 0) result = await scrapeComickClean(title);
  }

  if (result.chapters.length === 0) {
    console.log(`  [FAILED] No chapters found for "${title}".`);
    await supabase.from('series_intel').update({ last_scouted_at: new Date().toISOString() }).eq('series_id', series.id);
    return;
  }

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

  console.log(`  [SUCCESS] ${title} updated via [${result.platform}].`);
}

async function main() {
  console.log('--- STARTING MULTI-SOURCE SYNC & AUDIT ---');

  await runPreflightHealthCheck();

  const { data: queue, error } = await supabase
    .from('series')
    .select('id, title, reading_mode, series_intel(source_platform, target_url, last_scouted_at)')
    .limit(2000);

  if (error || !queue) {
    console.error('Failed to fetch queue:', error?.message);
    process.exit(1);
  }

  queue.sort((a, b) => {
    const intelA = Array.isArray(a.series_intel) ? a.series_intel[0] : a.series_intel;
    const intelB = Array.isArray(b.series_intel) ? b.series_intel[0] : b.series_intel;
    const timeA = intelA?.last_scouted_at ? new Date(intelA.last_scouted_at).getTime() : 0;
    const timeB = intelB?.last_scouted_at ? new Date(intelB.last_scouted_at).getTime() : 0;
    return timeA - timeB;
  });

  console.log(`Auditing all ${queue.length} series in backlog order...`);

  for (const series of queue) {
    await resolveAndIngestSeries(series);
    await delay(1000);
  }

  console.log('--- SYNC FINISHED ---');
}

main().catch(console.error);
