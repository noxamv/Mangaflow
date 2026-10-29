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
// 1. ADAPTER: MANGANATO / CHAPMANGANATO (Covers Manhwa, Manhua, and Manga)
// ============================================================================
async function scrapeManganato(seriesTitle) {
  try {
    const cleanQuery = seriesTitle.replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_');
    const searchUrl = `https://manganato.com/search/story/${encodeURIComponent(cleanQuery)}`;
    
    const searchRes = await fetch(searchUrl, { headers: HEADERS });
    if (!searchRes.ok) return { chapters: [], platform: 'manganato' };

    const searchHtml = await searchRes.text();
    const $s = cheerio.load(searchHtml);
    
    let storyUrl = $s('.search-story-item a.item-title, .panel-search-story .item-title').first().attr('href');
    if (!storyUrl) return { chapters: [], platform: 'manganato' };

    const storyRes = await fetch(storyUrl, { headers: HEADERS });
    if (!storyRes.ok) return { chapters: [], platform: 'manganato' };

    const storyHtml = await storyRes.text();
    const $ = cheerio.load(storyHtml);
    const chapters = [];

    $('.row-content-chapter li a.chapter-name, ul.row-content-chapter a').each((_, el) => {
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
      return { chapters, resolvedUrl: storyUrl, platform: 'manganato' };
    }
  } catch (err) {
    console.log(`  [Manganato Error]: ${err.message}`);
  }
  return { chapters: [], platform: 'manganato' };
}

// ============================================================================
// 2. ADAPTER: MANGACLASH / MADARA SCANS (Aggregates Asura/Reaper webtoons)
// ============================================================================
async function scrapeMangaClash(seriesTitle) {
  try {
    const slug = slugify(seriesTitle);
    const candidateUrls = [
      `https://mangaclash.com/manga/${slug}/`,
      `https://toonily.com/webtoon/${slug}/`
    ];

    for (const url of candidateUrls) {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);
      const chapters = [];

      $('.wp-manga-chapter a, li.wp-manga-chapter a').each((_, el) => {
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
        return { chapters, resolvedUrl: url, platform: url.includes('toonily') ? 'toonily' : 'mangaclash' };
      }
    }
  } catch (err) {
    console.log(`  [MangaClash Error]: ${err.message}`);
  }
  return { chapters: [], platform: 'mangaclash' };
}

// ============================================================================
// 3. ADAPTER: MANGADEX API
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
// 4. ADAPTER: MANGAPILL
// ============================================================================
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
// 5. WATERFALL ORCHESTRATION WITH PRIORITY
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
    // 1. Manganato (Top hit for full Manhwa chapter runs)
    result = await scrapeManganato(title);

    // 2. MangaClash / Toonily (Madara Scans mirror)
    if (result.chapters.length === 0) {
      result = await scrapeMangaClash(title);
    }

    // 3. MangaDex
    if (result.chapters.length === 0) {
      result = await scrapeMangaDex(targetUrl, title);
    }

    // 4. MangaPill
    if (result.chapters.length === 0) {
      result = await scrapeMangaPill(targetUrl, title);
    }
  } else {
    // MANGA LANE
    // 1. MangaPill (Primary manga mirror)
    result = await scrapeMangaPill(targetUrl, title);

    // 2. MangaDex
    if (result.chapters.length === 0) {
      result = await scrapeMangaDex(targetUrl, title);
    }

    // 3. Manganato fallback
    if (result.chapters.length === 0) {
      result = await scrapeManganato(title);
    }
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
  console.log('--- STARTING MULTI-SOURCE SYNC WITH MANGANATO & SCANS ---');

  const { data: queue, error } = await supabase
    .from('series')
    .select('id, title, reading_mode, series_intel(source_platform, target_url, last_scouted_at)')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error || !queue) {
    console.error('Failed to fetch queue:', error?.message);
    process.exit(1);
  }

  console.log(`Processing ${queue.length} series...`);

  for (const series of queue) {
    await resolveAndIngestSeries(series);
    await delay(1000);
  }

  console.log('--- SYNC FINISHED ---');
}

main().catch(console.error);
