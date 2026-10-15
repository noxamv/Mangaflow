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

const MUST_HAVE_SERIES = [
  {
    title: 'Lookism',
    slug: 'lookism',
    english_title: 'Lookism',
    native_title: '외모지상주의',
    country_of_origin: 'KR',
    cover_url: 'https://media.kitsu.app/manga/poster_images/25686/original.jpg',
    search_terms: ['lookism'],
  },
  {
    title: 'Lord of the Mysteries',
    slug: 'lord-of-the-mysteries',
    english_title: 'Lord of the Mysteries',
    native_title: '诡秘之主',
    country_of_origin: 'CN',
    cover_url: 'https://media.kitsu.app/manga/poster_images/46886/original.jpg',
    search_terms: ['lord of the mysteries', 'lord of mysteries'],
  },
  {
    title: 'The Beginning After the End',
    slug: 'the-beginning-after-the-end',
    english_title: 'The Beginning After the End',
    native_title: 'The Beginning After the End',
    country_of_origin: 'US',
    cover_url: 'https://media.kitsu.app/manga/poster_images/42555/original.jpg',
    search_terms: ['the beginning after the end', 'tbate'],
  },
  {
    title: "Omniscient Reader's Viewpoint",
    slug: 'omniscient-readers-viewpoint',
    english_title: "Omniscient Reader's Viewpoint",
    native_title: '전지적 독자 시점',
    country_of_origin: 'KR',
    cover_url: 'https://media.kitsu.app/manga/poster_images/43465/original.jpg',
    search_terms: ['omniscient readers viewpoint', 'omniscient reader'],
  },
  {
    title: 'Shadow Slave',
    slug: 'shadow-slave',
    english_title: 'Shadow Slave',
    native_title: 'Shadow Slave',
    country_of_origin: 'US',
    cover_url: 'https://media.kitsu.app/manga/poster_images/48366/original.jpg',
    search_terms: ['shadow slave'],
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
      console.warn('  ⚠️ Rate limited. Pausing 10s...');
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
  const { data: existing } = await supabase
    .from('series')
    .select('id, title, slug, cover_url')
    .or(`slug.eq."${item.slug}",title.eq."${item.title}",english_title.eq."${item.english_title}"`)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    if (!existing.cover_url || existing.cover_url.includes('mangadex.org')) {
      await supabase
        .from('series')
        .update({ cover_url: item.cover_url, slug: item.slug })
        .eq('id', existing.id);
    }
    return existing.id;
  }

  console.log(`➕ Inserting series "${item.title}" with slug "${item.slug}"...`);
  const { data: inserted, error } = await supabase
    .from('series')
    .insert([
      {
        title: item.title,
        slug: item.slug,
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
    console.error(`  ✗ Insert failed for "${item.title}":`, error.message);
    return null;
  }
  return inserted?.id;
}

// Search across terms until a match is found
async function findComickMatch(terms) {
  for (const term of terms) {
    const clean = term.replace(/[【】\[\]\(\)'"]/g, ' ').trim();
    const url = `https://api.comick.io/v1.0/search?q=${encodeURIComponent(clean)}&t=true`;
    const res = await fetchJson(url);
    await delay(400);

    if (Array.isArray(res) && res.length > 0) {
      return res[0];
    }
  }
  return null;
}

// Fetch all chapters across paginated results
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

// Fallback search to MangaDex if Comick is empty
async function fetchMangaDexChapters(title) {
  const clean = title.replace(/[【】\[\]\(\)'"]/g, ' ').trim();
  const searchUrl = `https://api.mangadex.org/manga?title=${encodeURIComponent(clean)}&limit=1`;
  const searchRes = await fetchJson(searchUrl);
  await delay(350);

  const mangaId = searchRes?.data?.[0]?.id;
  if (!mangaId) return [];

  let all = [];
  let offset = 0;
  while (offset < 800) {
    const feedUrl = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=100&offset=${offset}`;
    const feedRes = await fetchJson(feedUrl);
    await delay(350);

    const list = feedRes?.data || [];
    if (list.length === 0) break;

    all.push(...list);
    if (list.length < 100) break;
    offset += 100;
  }

  return all.map((ch) => ({
    chap: ch.attributes?.chapter,
    title: ch.attributes?.title || `Chapter ${ch.attributes?.chapter}`,
    created_at: ch.attributes?.publishAt || new Date().toISOString(),
  }));
}

async function run() {
  console.log('=== Starting Popular Series & Latest Chapter Sync ===\n');

  for (const item of MUST_HAVE_SERIES) {
    const seriesId = await ensureSeriesExists(item);
    if (!seriesId) continue;

    console.log(`[Syncing] "${item.title}"...`);
    let rawChapters = [];

    // 1. Try Comick with fallback query candidates
    const match = await findComickMatch(item.search_terms);
    if (match?.hid) {
      console.log(`  ✓ Matched provider comic: "${match.title}"`);
      rawChapters = await fetchAllChapters(match.hid);
    }

    // 2. Fallback to MangaDex if Comick fails
    if (rawChapters.length === 0) {
      console.log(`  ℹ Comick empty for "${item.title}". Querying MangaDex...`);
      rawChapters = await fetchMangaDexChapters(item.title);
    }

    if (rawChapters.length === 0) {
      console.warn(`  ✗ No chapters found for "${item.title}"`);
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

    // Batch upsert in chunks of 200
    const chunkSize = 200;
    for (let i = 0; i < cleanRows.length; i += chunkSize) {
      const slice = cleanRows.slice(i, i + chunkSize);
      await supabase
        .from('chapters')
        .upsert(slice, { onConflict: 'series_id,chapter_number', ignoreDuplicates: false });
    }

    const latest = Math.max(...cleanRows.map((r) => r.chapter_number));
    console.log(`  ✓ Synced ${cleanRows.length} chapters. Latest: Ch. ${latest}\n`);
    await delay(500);
  }

  console.log('=== Chapter Release Bot Finished Successfully ===');
}

run().catch((err) => {
  console.error('Fatal crash:', err);
  process.exit(1);
});
