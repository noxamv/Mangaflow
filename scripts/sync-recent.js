// scripts/sync-recent.js
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

function cleanTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseChapterNumber(text, href) {
  const match = text?.match(/chapter\s*([\d.]+)/i) || href?.match(/chapter-([\d.]+)/i);
  if (match) {
    const num = parseFloat(match[1]);
    if (!isNaN(num) && num >= 0 && num <= 4000) return num;
  }
  return null;
}

// 1. Fetch Latest Drops from WeebCentral (Direct HTMX Feed)
async function fetchWeebCentralLatest() {
  const drops = [];
  try {
    const res = await fetch('https://weebcentral.com/latest-updates', {
      headers: { ...HEADERS, 'HX-Request': 'true', Referer: 'https://weebcentral.com/' }
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);

    $('article, a[href*="/series/"]').each((_, el) => {
      const container = $(el).closest('article, div');
      const titleLink = container.find('a[href*="/series/"]').first();
      const title = titleLink.text().trim();
      const chLink = container.find('a[href*="/chapters/"]').first();
      const chText = chLink.text().trim();
      const chHref = chLink.attr('href');

      if (title && chHref) {
        const chNum = parseChapterNumber(chText, chHref);
        if (chNum !== null) {
          drops.push({
            cleanTitle: cleanTitle(title),
            rawTitle: title,
            chapterNumber: chNum,
            chapterTitle: chText || `Chapter ${chNum}`,
            externalId: chHref.startsWith('http') ? chHref : `https://weebcentral.com${chHref}`,
            source: 'weebcentral'
          });
        }
      }
    });
  } catch {}
  return drops;
}

// 2. Fetch Recent Drops from MangaPill
async function fetchMangaPillRecent() {
  const drops = [];
  try {
    const res = await fetch('https://mangapill.com/recent', {
      headers: { ...HEADERS, Referer: 'https://mangapill.com/' }
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);

    $('div.grid > div, div.space-y-3 > div').each((_, el) => {
      const titleEl = $(el).find('a[href*="/manga/"]').first();
      const title = titleEl.text().trim();
      const chEl = $(el).find('a[href*="/chapters/"]').first();
      const chText = chEl.text().trim();
      const chHref = chEl.attr('href');

      if (title && chHref) {
        const chNum = parseChapterNumber(chText, chHref);
        if (chNum !== null) {
          drops.push({
            cleanTitle: cleanTitle(title),
            rawTitle: title,
            chapterNumber: chNum,
            chapterTitle: chText || `Chapter ${chNum}`,
            externalId: chHref.startsWith('http') ? chHref : `https://mangapill.com${chHref}`,
            source: 'mangapill'
          });
        }
      }
    });
  } catch {}
  return drops;
}

async function main() {
  console.log('--- [RADAR] 30-MINUTE LATEST RELEASES SCAN ---');

  const { data: ongoingSeries, error } = await supabase
    .from('series')
    .select('id, title, slug')
    .neq('status', 'Completed');

  if (error || !ongoingSeries) {
    console.error('[DB Error]:', error?.message);
    process.exit(1);
  }

  const seriesMap = new Map();
  for (const s of ongoingSeries) {
    seriesMap.set(cleanTitle(s.title), s.id);
  }

  const [weebDrops, pillDrops] = await Promise.all([
    fetchWeebCentralLatest(),
    fetchMangaPillRecent()
  ]);

  const allDrops = [...weebDrops, ...pillDrops];
  console.log(`Discovered ${allDrops.length} raw releases on front pages.`);

  let newIngested = 0;

  for (const drop of allDrops) {
    const seriesId = seriesMap.get(drop.cleanTitle);
    if (!seriesId) continue;

    const { error: upsertErr } = await supabase.from('chapters').upsert(
      {
        series_id: seriesId,
        chapter_number: drop.chapterNumber,
        title: drop.chapterTitle,
        external_id: drop.externalId,
        pages: [drop.externalId],
        source: drop.source,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'series_id,chapter_number' }
    );

    if (!upsertErr) {
      newIngested++;
      await supabase
        .from('series_intel')
        .update({
          latest_known_chapter: drop.chapterNumber,
          last_scouted_at: new Date().toISOString(),
          next_scout_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('series_id', seriesId);
    }
  }

  console.log(`[RADAR COMPLETE] Ingested ${newIngested} new chapters for tracked series.`);
}

main().catch(console.error);
