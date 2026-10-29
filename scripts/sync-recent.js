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
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function syncRecent() {
  console.log('=== Checking Recent Feed for Newly Released Chapters ===');

  let res;
  try {
    res = await fetch('https://mangapill.com/chapters', { headers: HEADERS });
    if (!res.ok) {
      res = await fetch('https://mangapill.com/recent', { headers: HEADERS });
    }
  } catch (err) {
    console.error('Failed to fetch recent feed:', err.message);
    return;
  }

  if (!res.ok) {
    console.error(`Feed returned status ${res.status}`);
    return;
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const { data: allSeries, error: sErr } = await supabase
    .from('series')
    .select('id, title, slug');

  if (sErr || !allSeries) {
    console.error('Failed to load series catalog:', sErr?.message);
    return;
  }

  const seriesMap = new Map();
  for (const s of allSeries) {
    seriesMap.set(normalize(s.title), s);
    if (s.slug) {
      seriesMap.set(normalize(s.slug), s);
    }
  }

  const discovered = [];

  $('a[href*="/chapters/"]').each((_, el) => {
    const href = $(el).attr('href');
    const chapterText = $(el).text().trim();
    const parentContainer = $(el).closest('div');
    const mangaTitleLink = parentContainer.find('a[href*="/manga/"]').first();
    const mangaTitle = mangaTitleLink.text().trim();

    if (href && chapterText) {
      const match =
        chapterText.match(/chapter\s*([\d.]+)/i) ||
        href.match(/chapter-([\d.]+)/i) ||
        href.match(/-([\d.]+)\/?$/);

      if (match) {
        const fullChapterUrl = href.startsWith('http') ? href : `https://mangapill.com${href}`;
        discovered.push({
          mangaTitle: mangaTitle || chapterText.split(/chapter/i)[0].trim(),
          chapterNumber: parseFloat(match[1]),
          chapterUrl: fullChapterUrl,
          chapterTitle: chapterText,
        });
      }
    }
  });

  console.log(`Discovered ${discovered.length} chapter items on recent feed.`);

  let insertedCount = 0;
  for (const item of discovered) {
    const norm = normalize(item.mangaTitle);
    let matchedSeries = seriesMap.get(norm);

    if (!matchedSeries) {
      for (const [key, seriesObj] of seriesMap.entries()) {
        if (norm.length > 3 && (key.includes(norm) || norm.includes(key))) {
          matchedSeries = seriesObj;
          break;
        }
      }
    }

    if (matchedSeries) {
      const { error: upsertErr } = await supabase
        .from('chapters')
        .upsert(
          {
            series_id: matchedSeries.id,
            chapter_number: item.chapterNumber,
            title: item.chapterTitle || `Chapter ${item.chapterNumber}`,
            external_id: item.chapterUrl,
            pages: [item.chapterUrl],
            source: 'mangapill',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'series_id, chapter_number' }
        );

      if (!upsertErr) {
        console.log(`✓ Synced: [${matchedSeries.title}] Ch. ${item.chapterNumber}`);
        insertedCount++;

        await supabase
          .from('series_intel')
          .update({
            latest_known_chapter: item.chapterNumber,
            last_scouted_at: new Date().toISOString(),
          })
          .eq('series_id', matchedSeries.id);
      }
    }
  }

  console.log(`=== Ingested ${insertedCount} new chapters ===`);
}

syncRecent().catch(console.error);
