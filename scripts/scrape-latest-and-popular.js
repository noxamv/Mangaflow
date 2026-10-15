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

// Priority series list to keep 100% updated with full chapters
const MUST_HAVE_SERIES = [
  {
    title: 'Lookism',
    english_title: 'Lookism',
    native_title: '외모지상주의',
    country_of_origin: 'KR',
    cover_url: 'https://media.kitsu.app/manga/poster_images/25686/original.jpg',
  },
  {
    title: 'Lord of the Mysteries',
    english_title: 'Lord of the Mysteries',
    native_title: '诡秘之主',
    country_of_origin: 'CN',
    cover_url: 'https://media.kitsu.app/manga/poster_images/46886/original.jpg',
  },
  {
    title: 'The Beginning After the End',
    english_title: 'The Beginning After the End',
    native_title: 'The Beginning After the End',
    country_of_origin: 'US',
    cover_url: 'https://media.kitsu.app/manga/poster_images/42555/original.jpg',
  },
  {
    title: "Omniscient Reader's Viewpoint",
    english_title: "Omniscient Reader's Viewpoint",
    native_title: '전지적 독자 시점',
    country_of_origin: 'KR',
    cover_url: 'https://media.kitsu.app/manga/poster_images/43465/original.jpg',
  },
  {
    title: 'Shadow Slave',
    english_title: 'Shadow Slave',
    native_title: 'Shadow Slave',
    country_of_origin: 'US',
    cover_url: 'https://media.kitsu.app/manga/poster_images/48366/original.jpg',
  },
];

async function fetchJson(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });

    if (res.status === 429) {
      console.warn('  ⚠️ Rate limit encountered. Pausing 10s...');
      await delay(10000);
      return null;
    }
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function ensureSeriesExists(item) {
  // Check if series already exists
  const { data: existing } = await supabase
    .from('series')
    .select('id, title, cover_url')
    .or(`title.eq."${item.title}",english_title.eq."${item.english_title}"`)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    if (!existing.cover_url || existing.cover_url.includes('mangadex.org')) {
      await supabase
        .from('series')
        .update({ cover_url: item.cover_url })
        .eq('id', existing.id);
    }
    return existing.id;
  }

  // If absent, insert dynamically
  console.log(`➕ Series "${item.title}" missing from database. Creating entry...`);
  const { data: inserted, error } = await supabase
    .from('series')
    .insert([
      {
        title: item.title,
        english_title: item.english_title,
        native_title: item.native_title,
        country_of_origin: item.country_of_origin,
        cover_url: item.cover_url,
        status: 'ongoing',
      },
    ])
    .select('id')
    .single();

  if (error) {
    console.error(`  ✗ Error creating "${item.title}":`, error.message);
    return null;
  }
  return inserted?.id;
}

async function searchComic(query) {
  const clean = query
    .replace(/[【】\[\]\(\)]/g, ' ')
    .replace(/["'""'']/g, '')
    .split(/[~:–—\-]/)[0]
    .trim();

  const url = `https://api.comick.io/v1.0/search?q=${encodeURIComponent(clean)}&t=true`;
  const res = await fetchJson(url);
  await delay(450);

  if (Array.isArray(res) && res.length > 0) {
    return res[0];
  }
  return null;
}

async function fetchAllChapters(hid) {
  let all = [];
  let page = 1;
  const limit = 100;

  while (page <= 20) {
    const url = `https://api.comick.io/comic/${hid}/chapters?lang=en&page=${page}&limit=${limit}`;
    const data = await fetchJson(url);
    await delay(350);

    const list = data?.chapters || [];
    if (list.length === 0) break;

    all.push(...list);
    if (list.length < limit) break;
    page++;
  }
  return all;
}

async function run() {
  console.log('=== Starting Popular Series & Latest Chapter Sync ===\n');

  // 1. Process Must-Have High Priority Series
  for (const item of MUST_HAVE_SERIES) {
    const seriesId = await ensureSeriesExists(item);
    if (!seriesId) continue;

    console.log(`Checking chapters for priority series: "${item.title}"...`);
    const comic = await searchComic(item.title);

    if (!comic?.hid) {
      console.warn(`  ✗ Search match not found on mirror for: ${item.title}`);
      continue;
    }

    const rawChapters = await fetchAllChapters(comic.hid);
    if (rawChapters.length === 0) {
      console.warn(`  ✗ No chapters returned for: ${item.title}`);
      continue;
    }

    const rows = rawChapters
      .filter((c) => c.chap !== null && c.chap !== undefined && !isNaN(parseFloat(c.chap)))
      .map((c) => ({
        series_id: seriesId,
        chapter_number: parseFloat(c.chap),
        title: c.title && c.title.trim() ? c.title.trim() : `Chapter ${c.chap}`,
        published_at: c.created_at ? new Date(c.created_at).toISOString() : new Date().toISOString(),
      }));

    const uniqueMap = new Map();
    for (const r of rows) {
      if (!uniqueMap.has(r.chapter_number)) {
        uniqueMap.set(r.chapter_number, r);
      }
    }
    const cleanRows = Array.from(uniqueMap.values());

    const chunkSize = 200;
    for (let i = 0; i < cleanRows.length; i += chunkSize) {
      const slice = cleanRows.slice(i, i + chunkSize);
      await supabase
        .from('chapters')
        .upsert(slice, { onConflict: 'series_id,chapter_number', ignoreDuplicates: false });
    }

    const latest = Math.max(...cleanRows.map((r) => r.chapter_number));
    console.log(`  ✓ Synced ${cleanRows.length} chapters for "${item.title}". Latest: Ch. ${latest}\n`);
    await delay(600);
  }

  // 2. Refresh Ongoing Series in Database for Any New Releases
  console.log('Checking all other ongoing series for new chapter drops...');
  const { data: ongoingList } = await supabase
    .from('series')
    .select('id, title, english_title')
    .eq('status', 'ongoing')
    .limit(20);

  if (ongoingList && ongoingList.length > 0) {
    for (const item of ongoingList) {
      const name = item.english_title || item.title;
      const comic = await searchComic(name);
      if (!comic?.hid) continue;

      const url = `https://api.comick.io/comic/${comic.hid}/chapters?lang=en&page=1&limit=20`;
      const data = await fetchJson(url);
      await delay(400);

      const chaps = data?.chapters || [];
      if (chaps.length > 0) {
        const rows = chaps
          .filter((c) => c.chap !== null && !isNaN(parseFloat(c.chap)))
          .map((c) => ({
            series_id: item.id,
            chapter_number: parseFloat(c.chap),
            title: c.title && c.title.trim() ? c.title.trim() : `Chapter ${c.chap}`,
            published_at: c.created_at ? new Date(c.created_at).toISOString() : new Date().toISOString(),
          }));

        if (rows.length > 0) {
          await supabase
            .from('chapters')
            .upsert(rows, { onConflict: 'series_id,chapter_number', ignoreDuplicates: true });
        }
      }
    }
  }

  console.log('\n=== Chapter Release Bot Finished Successfully ===');
}

run().catch((err) => {
  console.error('Fatal crash:', err);
  process.exit(1);
});
