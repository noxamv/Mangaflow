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

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

async function syncRecent() {
  console.log('=== Checking Feed for Daily Releases & Brand-New Series ===');

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

  // Load known series into an in-memory normalized map
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
    const mangaHref = mangaTitleLink.attr('href') || '';
    const mangaTitle = mangaTitleLink.text().trim();

    if (href && chapterText) {
      const match =
        chapterText.match(/chapter\s*([\d.]+)/i) ||
        href.match(/chapter-([\d.]+)/i) ||
        href.match(/-([\d.]+)\/?$/);

      if (match) {
        const fullChapterUrl = href.startsWith('http') ? href : `https://mangapill.com${href}`;
        const fullMangaUrl = mangaHref ? (mangaHref.startsWith('http') ? mangaHref : `https://mangapill.com${mangaHref}`) : '';

        discovered.push({
          mangaTitle: mangaTitle || chapterText.split(/chapter/i)[0].trim(),
          mangaUrl: fullMangaUrl,
          chapterNumber: parseFloat(match[1]),
          chapterUrl: fullChapterUrl,
          chapterTitle: chapterText,
        });
      }
    }
  });

  console.log(`Discovered ${discovered.length} release items on feed.`);

  let insertedCount = 0;
  let newSeriesCount = 0;

  for (const item of discovered) {
    if (!item.mangaTitle || item.mangaTitle.length < 2) continue;

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

    // Auto-create brand new series if it does not exist in catalog
    if (!matchedSeries) {
      const baseSlug = slugify(item.mangaTitle);
      const uniqueSlug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;

      console.log(`[NEW SERIES DISCOVERED] Creating: ${item.mangaTitle}`);

      const { data: newSeries, error: createErr } = await supabase
        .from('series')
        .insert({
          title: item.mangaTitle,
          slug: uniqueSlug,
          status: 'ongoing',
          reading_mode: 'paged',
          source: 'mangapill',
          source_url: item.mangaUrl,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id, title, slug')
        .single();

      if (!createErr && newSeries) {
        matchedSeries = newSeries;
        seriesMap.set(norm, newSeries);
        newSeriesCount++;

        // Add corresponding tracking entry into series_intel
        await supabase.from('series_intel').insert({
          series_id: newSeries.id,
          slug: newSeries.slug,
          source_platform: 'mangapill',
          target_url: item.mangaUrl || item.chapterUrl,
          latest_known_chapter: item.chapterNumber,
          last_scouted_at: new Date().toISOString(),
        });
      }
    }

    // Ingest the chapter
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
        console.log(`✓ Chapter Synced: [${matchedSeries.title}] Ch. ${item.chapterNumber}`);
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

  console.log(`=== Done. Created ${newSeriesCount} new series & ingested ${insertedCount} chapters ===`);
}

syncRecent().catch(console.error);
