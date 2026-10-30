if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocket {};
}

import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[FATAL] Missing Supabase environment credentials.');
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

const NOVEL_KEYWORDS = ['novel', 'light novel', 'web novel', '(ln)', '(wn)', 'raw text'];

function isNovel(text) {
  const lower = (text || '').toLowerCase();
  return NOVEL_KEYWORDS.some((k) => lower.includes(k));
}

function sanitizeChapters(rawChapters, isWebtoon) {
  const MAX_LIMIT = isWebtoon ? 950 : 1600;
  const filtered = [];

  for (const ch of rawChapters) {
    const num = ch.chapter_number;
    if (isNaN(num) || num < 0 || num > MAX_LIMIT) continue;
    if (ch.title && isNovel(ch.title)) continue;
    filtered.push(ch);
  }

  if (filtered.length > 5) {
    const nums = filtered.map((c) => c.chapter_number).sort((a, b) => a - b);
    const median = nums[Math.floor(nums.length / 2)];
    return filtered.filter((c) => {
      if (filtered.length < 50 && c.chapter_number > median + 300) return false;
      return true;
    });
  }

  return filtered;
}

// 1. WEEBCENTRAL ADAPTER
async function scrapeWeebCentral(title) {
  try {
    const searchRes = await fetch(`https://weebcentral.com/search/data?author=&text=${encodeURIComponent(title)}`, {
      headers: HEADERS
    });
    if (!searchRes.ok) return { chapters: [], platform: 'weebcentral' };

    const searchHtml = await searchRes.text();
    const $ = cheerio.load(searchHtml);
    const link = $('a[href*="/series/"]').first().attr('href');
    if (!link) return { chapters: [], platform: 'weebcentral' };

    const seriesUrl = link.startsWith('http') ? link : `https://weebcentral.com${link}`;
    const seriesId = link.match(/series\/([a-zA-Z0-9_-]+)/)?.[1];
    if (!seriesId) return { chapters: [], platform: 'weebcentral' };

    const chapsRes = await fetch(`https://weebcentral.com/series/${seriesId}/full-chapter-list`, { headers: HEADERS });
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

    return { chapters, resolvedUrl: seriesUrl, platform: 'weebcentral' };
  } catch {
    return { chapters: [], platform: 'weebcentral' };
  }
}

// 2. COMICK CLEAN API ADAPTER
async function scrapeComickClean(title) {
  try {
    const searchRes = await fetch(`https://api.comick.fun/v1.0/search?q=${encodeURIComponent(title)}&limit=1`, {
      headers: HEADERS
    });
    if (!searchRes.ok) return { chapters: [], platform: 'comick' };

    const searchJson = await searchRes.json();
    const comic = Array.isArray(searchJson) ? searchJson[0] : null;
    if (!comic?.hid) return { chapters: [], platform: 'comick' };

    let page = 1;
    const chapters = [];

    while (page <= 12) {
      const chapRes = await fetch(
        `https://api.comick.fun/comic/${comic.hid}/chapters?lang=en&limit=100&page=${page}`,
        { headers: HEADERS }
      );
      if (!chapRes.ok) break;

      const chapJson = await chapRes.json();
      const items = chapJson.chapters || [];
      if (items.length === 0) break;

      for (const item of items) {
        const chNum = parseFloat(item.chap);
        if (!isNaN(chNum)) {
          chapters.push({
            chapter_number: chNum,
            title: item.title ? `Chapter ${chNum} - ${item.title}` : `Chapter ${chNum}`,
            external_id: `comick:${item.hid}`,
            pages: [`https://comick.fun/chapter/${item.hid}`]
          });
        }
      }
      page++;
      await delay(120);
    }

    return { chapters, resolvedUrl: `https://comick.io/comic/${comic.slug}`, platform: 'comick' };
  } catch {
    return { chapters: [], platform: 'comick' };
  }
}

// 3. MANGAPILL ADAPTER (WITH TITLE FALLBACK ON 404)
async function scrapeMangaPill(targetUrl, title) {
  let url = targetUrl && targetUrl.includes('mangapill.com') ? targetUrl : null;

  async function parsePage(pageUrl) {
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
          const full = href.startsWith('http') ? href : `https://mangapill.com${href}`;
          const num = parseFloat(match[1]);
          if (!isNaN(num)) {
            chaps.push({
              chapter_number: num,
              title: text || `Chapter ${num}`,
              external_id: full,
              pages: [full]
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
  if (url) chapters = await parsePage(url);

  if (chapters.length === 0 && title) {
    try {
      const searchRes = await fetch(`https://mangapill.com/search?q=${encodeURIComponent(title)}`, { headers: HEADERS });
      if (searchRes.ok) {
        const html = await searchRes.text();
        const $ = cheerio.load(html);
        const href = $('a[href*="/manga/"]').first().attr('href');
        if (href) {
          url = href.startsWith('http') ? href : `https://mangapill.com${href}`;
          chapters = await parsePage(url);
        }
      }
    } catch {}
  }

  return { chapters, resolvedUrl: url, platform: 'mangapill' };
}

// 4. MANGADEX API ADAPTER
async function scrapeMangaDex(targetUrl, title) {
  let mangaId = null;
  if (targetUrl?.includes('mangadex.org/title/')) {
    mangaId = targetUrl.match(/title\/([a-f0-9-]+)/)?.[1];
  } else if (title) {
    try {
      const search = await fetch(`https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1`, {
        headers: HEADERS
      });
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
      const res = await fetch(
        `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=${limit}&offset=${offset}&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`,
        { headers: HEADERS }
      );
      if (!res.ok) break;

      const json = await res.json();
      total = json.total || 0;

      for (const item of json.data || []) {
        const num = parseFloat(item.attributes?.chapter);
        if (!isNaN(num)) {
          chapters.push({
            chapter_number: num,
            title: item.attributes?.title || `Chapter ${num}`,
            external_id: `mangadex:${item.id}`,
            pages: [`https://mangadex.org/chapter/${item.id}`]
          });
        }
      }
      offset += limit;
      await delay(180);
    }
  } catch {}

  return { chapters, resolvedUrl: `https://mangadex.org/title/${mangaId}`, platform: 'mangadex' };
}

function isManhwa(series) {
  if (series.reading_mode === 'webtoon' || series.reading_mode === 'vertical') return true;
  const t = (series.title || '').toLowerCase();
  const kw = [
    'solo',
    'leveling',
    'ranker',
    'reincarnat',
    'villainess',
    'player',
    'dungeon',
    'tower',
    'necromancer',
    'cultivat',
    'martial',
    'murim',
    'lookism',
    'eleceed',
    'omniscient',
    'tomb raider king',
    'taming master',
    'priscilla'
  ];
  return kw.some((k) => t.includes(k));
}

async function resolveSeries(series) {
  const intel = Array.isArray(series.series_intel) ? series.series_intel[0] || {} : series.series_intel || {};
  const title = series.title;
  const targetUrl = intel.target_url;
  const webtoon = isManhwa(series);

  console.log(`\nAuditing: "${title}" [Format: ${webtoon ? 'Webtoon/Manhwa' : 'Manga'}]`);

  const candidates = [];

  if (webtoon) {
    const wc = await scrapeWeebCentral(title);
    if (wc.chapters.length > 0) candidates.push(wc);

    const cm = await scrapeComickClean(title);
    if (cm.chapters.length > 0) candidates.push(cm);

    const mp = await scrapeMangaPill(targetUrl, title);
    if (mp.chapters.length > 0) candidates.push(mp);

    const md = await scrapeMangaDex(targetUrl, title);
    if (md.chapters.length > 0) candidates.push(md);
  } else {
    const mp = await scrapeMangaPill(targetUrl, title);
    if (mp.chapters.length > 0) candidates.push(mp);

    const md = await scrapeMangaDex(targetUrl, title);
    if (md.chapters.length > 0) candidates.push(md);

    const wc = await scrapeWeebCentral(title);
    if (wc.chapters.length > 0) candidates.push(wc);

    const cm = await scrapeComickClean(title);
    if (cm.chapters.length > 0) candidates.push(cm);
  }

  const validCandidates = candidates
    .filter((c) => !isNovel(c.resolvedUrl))
    .map((c) => ({ ...c, chapters: sanitizeChapters(c.chapters, webtoon) }))
    .filter((c) => c.chapters.length > 0);

  if (validCandidates.length === 0) {
    console.log(`  [FAILED] No valid comic chapters found for "${title}".`);
    await supabase.from('series_intel').update({ last_scouted_at: new Date().toISOString() }).eq('series_id', series.id);
    return;
  }

  // Max-Coverage Selection: choose candidate with the most chapters
  validCandidates.sort((a, b) => b.chapters.length - a.chapters.length);
  const best = validCandidates[0];

  console.log(`  -> Selected Best Source: [${best.platform}] with ${best.chapters.length} chapters.`);

  const unique = new Map();
  for (const ch of best.chapters) {
    if (!unique.has(ch.chapter_number)) {
      unique.set(ch.chapter_number, {
        series_id: series.id,
        chapter_number: ch.chapter_number,
        title: ch.title,
        external_id: ch.external_id,
        pages: ch.pages,
        source: best.platform,
        updated_at: new Date().toISOString()
      });
    }
  }

  const payload = Array.from(unique.values());
  const maxCh = Math.max(...payload.map((c) => c.chapter_number));

  const CHUNK = 200;
  for (let i = 0; i < payload.length; i += CHUNK) {
    await supabase.from('chapters').upsert(payload.slice(i, i + CHUNK), { onConflict: 'series_id, chapter_number' });
  }

  await supabase
    .from('series_intel')
    .update({
      source_platform: best.platform,
      target_url: best.resolvedUrl || targetUrl || '',
      latest_known_chapter: maxCh,
      last_scouted_at: new Date().toISOString()
    })
    .eq('series_id', series.id);

  console.log(`  [SUCCESS] Ingested ${payload.length} chapters (Max: Ch. ${maxCh}) via [${best.platform}].`);
}

async function main() {
  console.log('--- STAGE 2: COMPLETE CATALOG GAP AUDIT ---');

  const { data: queue, error } = await supabase
    .from('series')
    .select('id, title, reading_mode, series_intel(source_platform, target_url, last_scouted_at)')
    .limit(2000);

  if (error || !queue) {
    console.error('[Queue Error]:', error?.message);
    process.exit(1);
  }

  queue.sort((a, b) => {
    const intelA = Array.isArray(a.series_intel) ? a.series_intel[0] : a.series_intel;
    const intelB = Array.isArray(b.series_intel) ? b.series_intel[0] : b.series_intel;
    const timeA = intelA?.last_scouted_at ? new Date(intelA.last_scouted_at).getTime() : 0;
    const timeB = intelB?.last_scouted_at ? new Date(intelB.last_scouted_at).getTime() : 0;
    return timeA - timeB;
  });

  console.log(`Processing all ${queue.length} series in backlog order...`);

  for (const s of queue) {
    await resolveSeries(s);
    await delay(750);
  }

  console.log('--- AUDIT FINISHED ---');
}

main().catch(console.error);
