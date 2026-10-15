import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Fatal Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: null },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'MangaFlow-Bot/2.0 (contact@mangaflow.app)',
        Accept: 'application/json',
      },
    });

    if (res.status === 429) {
      console.warn('  ⚠️ Rate limit hit. Backing off 5s...');
      await delay(5000);
      return null;
    }

    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

// 1. Search MangaDex for the Manga ID
async function searchMangaDex(series) {
  const titles = [
    series.english_title,
    series.title,
    series.native_title,
  ].filter(Boolean);

  for (const raw of titles) {
    const clean = raw
      .replace(/[【】\[\]\(\)]/g, ' ')
      .replace(/["'""'']/g, '')
      .split(/[~:–—\-]/)[0]
      .trim();

    if (!clean || clean.length < 2) continue;

    const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(clean)}&limit=5&includes[]=cover_art`;
    const data = await fetchJson(url);
    await delay(350);

    if (data?.data && data.data.length > 0) {
      return data.data[0];
    }
  }
  return null;
}

// 2. Fetch English chapters from MangaDex
async function fetchMangaDexChapters(mangaId) {
  let allChapters = [];
  let offset = 0;
  const limit = 100;

  while (offset < 300) {
    const url = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=${limit}&offset=${offset}`;
    const data = await fetchJson(url);
    await delay(350);

    const list = data?.data || [];
    if (list.length === 0) break;

    allChapters.push(...list);
    if (list.length < limit) break;
    offset += limit;
  }

  return allChapters;
}

// 3. Fallback: Search Jikan (MyAnimeList open API) to get chapter counts if scans are licensed
async function fetchJikanManga(series) {
  const term = series.english_title || series.title;
  const clean = term.replace(/[【】\[\]\(\)]/g, ' ').split(/[~:–—\-]/)[0].trim();
  const url = `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(clean)}&limit=1`;
  const res = await fetchJson(url);
  await delay(1000); // Jikan rate limits to 3 req/sec

  const manga = res?.data?.[0];
  if (manga && manga.chapters) {
    return manga.chapters;
  }
  return null;
}

async function run() {
  console.log('Querying target series lacking chapters from Supabase...');

  const { data: allSeries, error: seriesErr } = await supabase
    .from('series')
    .select('id, title, english_title, native_title, country_of_origin');

  if (seriesErr || !allSeries) {
    console.error('Failed to query series:', seriesErr?.message);
    return;
  }

  const { data: existingChapters, error: chapErr } = await supabase
    .from('chapters')
    .select('series_id');

  if (chapErr) {
    console.error('Failed to query chapters:', chapErr.message);
    return;
  }

  const populatedIds = new Set((existingChapters || []).map((c) => c.series_id));
  const targets = allSeries.filter((s) => !populatedIds.has(s.id));

  console.log(`Found ${targets.length} series needing chapters.\n`);

  let resolved = 0;
  let skipped = 0;

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const name = item.english_title || item.title;
    console.log(`[${i + 1}/${targets.length}] Locating: "${name}"...`);

    let chapterRows = [];

    // Attempt 1: MangaDex
    const mdManga = await searchMangaDex(item);
    if (mdManga?.id) {
      const feed = await fetchMangaDexChapters(mdManga.id);
      if (feed.length > 0) {
        chapterRows = feed
          .filter((ch) => ch.attributes?.chapter !== null && ch.attributes?.chapter !== undefined)
          .map((ch) => ({
            series_id: item.id,
            chapter_number: parseFloat(ch.attributes.chapter) || 0,
            title: ch.attributes.title || `Chapter ${ch.attributes.chapter}`,
            external_id: ch.id,
            published_at: ch.attributes.publishAt || new Date().toISOString(),
          }));
      }
    }

    // Attempt 2: If MangaDex has 0 open scans (licensed), generate placeholders via MAL/Jikan metadata
    if (chapterRows.length === 0) {
      console.log(`  ℹ MangaDex empty. Checking official index...`);
      const totalChaps = await fetchJikanManga(item);
      if (totalChaps && totalChaps > 0) {
        const count = Math.min(totalChaps, 50); // Seed up to 50 base chapters
        for (let num = 1; num <= count; num++) {
          chapterRows.push({
            series_id: item.id,
            chapter_number: num,
            title: `Chapter ${num}`,
            external_id: `official-${item.id}-${num}`,
            published_at: new Date().toISOString(),
          });
        }
      }
    }

    if (chapterRows.length === 0) {
      console.warn(`  ✗ Could not locate chapters for "${name}"`);
      skipped++;
      continue;
    }

    // Deduplicate by chapter number
    const uniqueMap = new Map();
    for (const row of chapterRows) {
      if (!uniqueMap.has(row.chapter_number)) {
        uniqueMap.set(row.chapter_number, row);
      }
    }
    const finalBatch = Array.from(uniqueMap.values());

    const { error: upsertErr } = await supabase
      .from('chapters')
      .upsert(finalBatch, { onConflict: 'series_id,chapter_number', ignoreDuplicates: true });

    if (upsertErr) {
      console.error(`  ✗ DB Error: ${upsertErr.message}`);
      skipped++;
    } else {
      console.log(`  ✓ Added ${finalBatch.length} chapters`);
      resolved++;
    }

    await delay(400);
  }

  console.log('\n=======================================');
  console.log(`Summary: ${resolved} populated, ${skipped} skipped.`);
  console.log('=======================================');
}

run().catch((err) => {
  console.error('Fatal crash:', err);
  process.exit(1);
});
