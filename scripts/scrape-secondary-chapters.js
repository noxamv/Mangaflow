import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Fatal Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// Disable realtime WebSocket to prevent Node runtime issues
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    transport: null,
  },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });

    if (res.status === 429) {
      console.warn('  [Comick] Rate limited. Pausing 15s...');
      await delay(15000);
      return null;
    }

    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

async function findComickComic(series) {
  // Cascading search: English Title -> Main Title -> Native Title
  const candidates = [
    series.english_title,
    series.title,
    series.native_title,
  ].filter(Boolean);

  for (const term of candidates) {
    const cleanTerm = term
      .replace(/[【】\[\]\(\)]/g, ' ')
      .replace(/["'""'']/g, '')
      .split(/[~:–—\-]/)[0]
      .trim();

    if (!cleanTerm || cleanTerm.length < 2) continue;

    const url = `https://api.comick.io/v1.0/search?q=${encodeURIComponent(cleanTerm)}&t=true`;
    const results = await fetchJson(url);
    await delay(500);

    if (Array.isArray(results) && results.length > 0) {
      return results[0];
    }
  }

  return null;
}

async function fetchComickChapters(hid) {
  const url = `https://api.comick.io/comic/${hid}/chapters?lang=en&limit=100`;
  const data = await fetchJson(url);
  await delay(500);
  return data?.chapters || [];
}

async function run() {
  console.log('Querying series from Supabase...');

  const { data: allSeries, error: seriesErr } = await supabase
    .from('series')
    .select('id, title, english_title, native_title, country_of_origin');

  if (seriesErr || !allSeries) {
    console.error('Failed to query series:', seriesErr?.message);
    return;
  }

  // Get all series IDs that already have chapters
  const { data: existingChapters, error: chapErr } = await supabase
    .from('chapters')
    .select('series_id');

  if (chapErr) {
    console.error('Failed to query chapters:', chapErr.message);
    return;
  }

  const populatedIds = new Set((existingChapters || []).map((c) => c.series_id));
  const targets = allSeries.filter((s) => !populatedIds.has(s.id));

  console.log(`Found ${targets.length} target series with 0 chapters.\n`);

  if (targets.length === 0) {
    console.log('All series have chapters.');
    return;
  }

  let resolved = 0;
  let skipped = 0;

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const displayName = item.english_title || item.title;
    console.log(`[${i + 1}/${targets.length}] Searching: "${displayName}"...`);

    const comic = await findComickComic(item);
    if (!comic || !comic.hid) {
      console.warn(`  ✗ Not found on secondary provider`);
      skipped++;
      continue;
    }

    const chapterList = await fetchComickChapters(comic.hid);
    if (!chapterList || chapterList.length === 0) {
      console.warn(`  ✗ Found comic "${comic.title}", but no English chapters returned`);
      skipped++;
      continue;
    }

    // Format rows for Supabase insertion
    const rows = chapterList
      .filter((ch) => ch.chap !== null && ch.chap !== undefined)
      .map((ch) => ({
        series_id: item.id,
        chapter_number: parseFloat(ch.chap) || 0,
        title: ch.title ? ch.title.trim() : `Chapter ${ch.chap}`.trim(),
        external_id: ch.hid,
        published_at: ch.created_at ? new Date(ch.created_at).toISOString() : new Date().toISOString(),
      }));

    // Deduplicate by chapter_number
    const uniqueRows = Array.from(
      new Map(rows.map((r) => [r.chapter_number, r])).values()
    );

    if (uniqueRows.length === 0) {
      console.warn(`  ✗ No valid numbered chapters found`);
      skipped++;
      continue;
    }

    const { error: insertErr } = await supabase
      .from('chapters')
      .upsert(uniqueRows, { onConflict: 'series_id,chapter_number', ignoreDuplicates: true });

    if (insertErr) {
      console.error(`  ✗ Insert error: ${insertErr.message}`);
      skipped++;
    } else {
      console.log(`  ✓ Inserted ${uniqueRows.length} chapters for "${displayName}"`);
      resolved++;
    }

    await delay(750);
  }

  console.log(`\n========================================`);
  console.log(`Finished processing.`);
  console.log(`Successfully populated: ${resolved}`);
  console.log(`Skipped / Unresolved:   ${skipped}`);
  console.log(`========================================`);
}

run().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
