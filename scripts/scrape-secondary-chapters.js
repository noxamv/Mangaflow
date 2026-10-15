import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'MangaFlow/1.0',
    },
  });
  if (res.status === 429) {
    console.warn('  ⚠️ Rate limited. Pausing 10s...');
    await delay(10000);
    return null;
  }
  if (!res.ok) return null;
  return res.json();
}

async function findComickComic(series) {
  // Cascade order: English -> Title -> Native
  const candidates = [
    series.english_title,
    series.title,
    series.native_title,
  ].filter(Boolean);

  for (const term of candidates) {
    const clean = term.replace(/[【】\[\]\(\)]/g, ' ').trim();
    const url = `https://api.comick.io/v1.0/search?q=${encodeURIComponent(clean)}&t=true`;
    const results = await fetchJson(url);
    await delay(400);

    if (Array.isArray(results) && results.length > 0) {
      return results[0]; // Best match
    }
  }
  return null;
}

async function fetchComickChapters(hid) {
  // Fetch up to 100 recent English chapters
  const url = `https://api.comick.io/comic/${hid}/chapters?lang=en&limit=100`;
  const data = await fetchJson(url);
  await delay(400);
  return data?.chapters || [];
}

async function run() {
  console.log('Fetching series with 0 chapters...');

  // Identify series missing chapters
  const { data: allSeries, error } = await supabase
    .from('series')
    .select('id, title, english_title, native_title, country_of_origin');

  if (error || !allSeries) {
    console.error('Failed to fetch series:', error?.message);
    return;
  }

  const { data: chaptersData } = await supabase
    .from('chapters')
    .select('series_id');

  const populatedSeriesIds = new Set((chaptersData || []).map((c) => c.series_id));
  const targets = allSeries.filter((s) => !populatedSeriesIds.has(s.id));

  console.log(`Found ${targets.length} target series with 0 chapters.\n`);

  let resolved = 0;
  let skipped = 0;

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const displayName = item.english_title || item.title;
    console.log(`[${i + 1}/${targets.length}] Searching: "${displayName}"...`);

    const comic = await findComickComic(item);
    if (!comic || !comic.hid) {
      console.warn(`  ✗ Not found on Comick`);
      skipped++;
      continue;
    }

    const chapterList = await fetchComickChapters(comic.hid);
    if (!chapterList || chapterList.length === 0) {
      console.warn(`  ✗ Found comic "${comic.title}", but 0 English chapters available`);
      skipped++;
      continue;
    }

    // Format rows to insert into your chapters table
    const rows = chapterList.map((ch) => ({
      series_id: item.id,
      chapter_number: parseFloat(ch.chap) || 0,
      title: ch.title || `Chapter ${ch.chap || ''}`.trim(),
      source: 'comick',
      external_id: ch.hid,
      published_at: ch.created_at ? new Date(ch.created_at).toISOString() : new Date().toISOString(),
    }));

    // Deduplicate by chapter_number
    const uniqueRows = Array.from(
      new Map(rows.map((r) => [r.chapter_number, r])).values()
    );

    const { error: insertErr } = await supabase
      .from('chapters')
      .upsert(uniqueRows, { onConflict: 'series_id,chapter_number', ignoreDuplicates: true });

    if (insertErr) {
      console.error(`  ✗ Insert error: ${insertErr.message}`);
      skipped++;
    } else {
      console.log(`  ✓ Added ${uniqueRows.length} chapters for "${displayName}"`);
      resolved++;
    }

    await delay(500);
  }

  console.log(`\nProcessing complete! Resolved: ${resolved}, Skipped/Manual: ${skipped}`);
}

run().catch(console.error);
