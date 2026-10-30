// scripts/sync-recent.js
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

function cleanTitle(title) {
  return title.replace(/\s+/g, ' ').trim();
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-');
}

// 1. DISCOVER TOP READ SERIES FROM MANGADEX
async function fetchTopMangaDexSeries() {
  const candidates = [];
  try {
    const res = await fetch(
      'https://api.mangadex.org/manga?order[followedCount]=desc&limit=40&contentRating[]=safe&contentRating[]=suggestive&includes[]=cover_art',
      { headers: HEADERS }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const list = json.data || [];

    for (const item of list) {
      const titles = item.attributes?.title || {};
      const title = titles.en || Object.values(titles)[0];
      if (!title) continue;

      let coverUrl = null;
      const coverRel = item.relationships?.find((r) => r.type === 'cover_art');
      if (coverRel?.attributes?.fileName) {
        coverUrl = `https://uploads.mangadex.org/covers/${item.id}/${coverRel.attributes.fileName}.512.jpg`;
      }

      candidates.push({
        title: cleanTitle(title),
        cover_url: coverUrl,
        reading_mode: item.attributes?.originalLanguage === 'ko' || item.attributes?.originalLanguage === 'zh' ? 'webtoon' : 'paged',
        source: 'mangadex',
        target_url: `https://mangadex.org/title/${item.id}`,
        mangaId: item.id
      });
    }
  } catch (err) {
    console.log(`[Top MangaDex Error]: ${err.message}`);
  }
  return candidates;
}

// 2. DISCOVER TOP READ MANHWA/MANGA FROM MANGANATO TOP VIEWS
async function fetchTopManganatoSeries() {
  const candidates = [];
  const urls = [
    'https://natomanga.com/manga-list/topview',
    'https://manganato.com/genre-all?type=topview'
  ];

  for (const listUrl of urls) {
    try {
      const res = await fetch(listUrl, { headers: HEADERS, redirect: 'follow' });
      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      $('.content-genres-item, .list-truyen-item-wrap, .search-story-item').each((_, el) => {
        const titleEl = $(el).find('h3 a, a.item-title, a.genres-item-name').first();
        const title = titleEl.text().trim();
        const href = titleEl.attr('href');
        const img = $(el).find('img').first().attr('src');

        if (title && href) {
          candidates.push({
            title: cleanTitle(title),
            cover_url: img || null,
            reading_mode: href.includes('manhwa') || title.toLowerCase().includes('leveling') ? 'webtoon' : 'paged',
            source: 'manganato',
            target_url: href
          });
        }
      });

      if (candidates.length > 0) break;
    } catch {}
  }

  return candidates;
}

// 3. INGEST CHAPTERS FOR A DISCOVERED POPULAR SERIES
async function ingestChaptersForSeries(seriesId, title, targetUrl, source) {
  const chapters = [];

  if (source === 'mangadex' && targetUrl.includes('/title/')) {
    const mangaId = targetUrl.match(/title\/([a-f0-9-]+)/)?.[1];
    if (mangaId) {
      try {
        const feedRes = await fetch(
          `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=50&contentRating[]=safe&contentRating[]=suggestive`,
          { headers: HEADERS }
        );
        if (feedRes.ok) {
          const json = await feedRes.json();
          for (const item of (json.data || [])) {
            const chNum = parseFloat(item.attributes?.chapter);
            if (!isNaN(chNum)) {
              chapters.push({
                series_id: seriesId,
                chapter_number: chNum,
                title: item.attributes?.title || `Chapter ${chNum}`,
                external_id: `mangadex:${item.id}`,
                pages: [`https://mangadex.org/chapter/${item.id}`],
                source: 'mangadex',
                updated_at: new Date().toISOString()
              });
            }
          }
        }
      } catch {}
    }
  } else if (source === 'manganato' && targetUrl) {
    try {
      const res = await fetch(targetUrl, { headers: HEADERS, redirect: 'follow' });
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $('.row-content-chapter li a.chapter-name, ul.row-content-chapter a').each((_, el) => {
          const href = $(el).attr('href');
          const text = $(el).text().trim();
          const match = text.match(/chapter\s*([\d.]+)/i) || href?.match(/chapter-([\d.]+)/i);
          if (match && href) {
            const chNum = parseFloat(match[1]);
            if (!isNaN(chNum)) {
              chapters.push({
                series_id: seriesId,
                chapter_number: chNum,
                title: text || `Chapter ${chNum}`,
                external_id: href,
                pages: [href],
                source: 'manganato',
                updated_at: new Date().toISOString()
              });
            }
          }
        });
      }
    } catch {}
  }

  if (chapters.length > 0) {
    const CHUNK = 100;
    for (let i = 0; i < chapters.length; i += CHUNK) {
      await supabase.from('chapters').upsert(chapters.slice(i, i + CHUNK), { onConflict: 'series_id, chapter_number' });
    }

    const maxCh = Math.max(...chapters.map((c) => c.chapter_number));
    await supabase.from('series_intel').upsert({
      series_id: seriesId,
      source_platform: source,
      target_url: targetUrl,
      latest_known_chapter: maxCh,
      last_scouted_at: new Date().toISOString()
    }, { onConflict: 'series_id' });

    console.log(`  -> Synced ${chapters.length} chapters (Latest: Ch. ${maxCh})`);
  }
}

// 4. MAIN DISCOVERY CONTROLLER
async function main() {
  console.log('--- STARTING POPULAR/TOP SERIES DISCOVERY & RECENT SYNC ---');

  const { data: allExisting, error: exErr } = await supabase
    .from('series')
    .select('id, title, slug');

  if (exErr) {
    console.error('Failed to load existing catalog:', exErr.message);
    process.exit(1);
  }

  const existingTitles = new Set();
  const existingSlugs = new Set();
  const titleToIdMap = new Map();

  for (const s of (allExisting || [])) {
    const norm = s.title.toLowerCase().trim();
    existingTitles.add(norm);
    existingSlugs.add(s.slug);
    titleToIdMap.set(norm, s.id);
  }

  console.log(`Current catalog: ${existingTitles.size} unique titles indexed.`);

  const [mangadexTop, manganatoTop] = await Promise.all([
    fetchTopMangaDexSeries(),
    fetchTopManganatoSeries()
  ]);

  const candidates = [...mangadexTop, ...manganatoTop];
  console.log(`Collected ${candidates.length} top-read series candidates.`);

  let newlyCreated = 0;
  let existingUpdated = 0;

  for (const item of candidates) {
    const normTitle = item.title.toLowerCase().trim();
    let targetSeriesId = titleToIdMap.get(normTitle);

    if (targetSeriesId) {
      console.log(`[Already in Catalog] "${item.title}" -> Checking latest chapters...`);
      await ingestChaptersForSeries(targetSeriesId, item.title, item.target_url, item.source);
      existingUpdated++;
      await delay(500);
      continue;
    }

    let slug = slugify(item.title);
    if (existingSlugs.has(slug)) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const { data: newSeries, error: insErr } = await supabase
      .from('series')
      .insert({
        title: item.title,
        slug: slug,
        cover_url: item.cover_url,
        reading_mode: item.reading_mode,
        status: 'Ongoing'
      })
      .select('id')
      .single();

    if (insErr || !newSeries) {
      console.log(`  [Skipped] Insert failed for "${item.title}": ${insErr?.message}`);
      continue;
    }

    targetSeriesId = newSeries.id;
    existingTitles.add(normTitle);
    existingSlugs.add(slug);
    titleToIdMap.set(normTitle, targetSeriesId);
    newlyCreated++;

    console.log(`[NEW TOP SERIES ADDED] "${item.title}" -> Ingesting chapters...`);
    await ingestChaptersForSeries(targetSeriesId, item.title, item.target_url, item.source);
    await delay(600);
  }

  console.log(`\nDiscovery Summary: ${newlyCreated} new top series created, ${existingUpdated} existing series updated.`);
  console.log('--- RECENT SYNC FINISHED ---');
}

main().catch(console.error);
