import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_ID = parseInt(process.env.WORKER_ID || '1', 10);
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '5', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE credentials.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      if (res.status === 429) console.warn(`[HTTP 429] Rate limited: ${url}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    return null;
  }
}

function stripAccents(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchChapterNum(a, b) {
  if (a == null || b == null) return false;
  const cleanA = String(a).replace(/[^0-9.]/g, '');
  const cleanDb = String(b).replace(/[^0-9.]/g, '');
  if (!cleanA || !cleanDb) return false;
  return Math.abs(parseFloat(cleanA) - parseFloat(cleanDb)) < 0.001;
}

// Resilient MangaDex Resolver
async function resolveMangaDex(title) {
  const cleanTitle = stripAccents(title);
  
  // Try clean title search
  let res = await fetchJson(`https://api.mangadex.org/manga?title=${encodeURIComponent(cleanTitle)}&limit=1&includes[]=cover_art`);
  if (res?.data?.[0]?.id) return res.data[0].id;

  // Try first 3 words fallback if title has extra subtitle/punctuation
  const shortTitle = cleanTitle.split(' ').slice(0, 3).join(' ');
  if (shortTitle && shortTitle !== cleanTitle) {
    res = await fetchJson(`https://api.mangadex.org/manga?title=${encodeURIComponent(shortTitle)}&limit=1`);
    if (res?.data?.[0]?.id) return res.data[0].id;
  }

  return null;
}

// MangaDex Chapter Map with strictly encoded query params
async function getMangaDexChapterMap(mangaId) {
  const map = new Map();
  let offset = 0;
  const limit = 100;

  while (offset < 1000) {
    const url = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage%5B%5D=en&order%5Bchapter%5D=asc&limit=${limit}&offset=${offset}`;
    const data = await fetchJson(url);
    if (!data?.data?.length) break;

    for (const ch of data.data) {
      const chNum = ch.attributes?.chapter;
      if (chNum && !map.has(chNum)) {
        map.set(chNum, ch.id);
      }
    }
    if (data.data.length < limit) break;
    offset += limit;
    await delay(150);
  }
  return map;
}

async function getMangaDexPages(chapterId) {
  const atHome = await fetchJson(`https://api.mangadex.org/at-home/server/${chapterId}`);
  if (!atHome?.baseUrl || !atHome?.chapter?.data?.length) return null;
  const { baseUrl, chapter } = atHome;
  return chapter.data.map((file) => `${baseUrl}/data/${chapter.hash}/${file}`);
}

async function runWorker() {
  console.log(`Worker ${WORKER_ID} of ${TOTAL_WORKERS} running.`);

  const { data: allSeries } = await supabase
    .from('series')
    .select('id, title, slug, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(40);

  if (!allSeries?.length) {
    console.log('No series found.');
    return;
  }

  const assigned = allSeries.filter((_, idx) => idx % TOTAL_WORKERS === WORKER_ID - 1);
  console.log(`Worker ${WORKER_ID} assigned ${assigned.length} series.`);

  for (const s of assigned) {
    const { data: emptyChapters } = await supabase
      .from('chapters')
      .select('id, chapter_number')
      .eq('series_id', s.id)
      .or('pages.is.null,pages.eq.{}')
      .order('chapter_number', { ascending: true })
      .limit(30);

    if (!emptyChapters?.length) {
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    console.log(`\n[Worker ${WORKER_ID}] Processing "${s.title}" (${emptyChapters.length} empty)...`);

    const mdId = await resolveMangaDex(s.title);
    if (!mdId) {
      console.log(`[Worker ${WORKER_ID}] No MangaDex match for "${s.title}".`);
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    const chapterMap = await getMangaDexChapterMap(mdId);
    console.log(`[Worker ${WORKER_ID}] Found ${chapterMap.size} chapters on MangaDex.`);

    if (chapterMap.size === 0) {
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    let filledCount = 0;
    for (const ch of emptyChapters) {
      let targetId = null;
      for (const [chapNum, id] of chapterMap.entries()) {
        if (matchChapterNum(chapNum, ch.chapter_number)) {
          targetId = id;
          break;
        }
      }

      if (!targetId) continue;

      const pages = await getMangaDexPages(targetId);
      if (pages && pages.length > 0) {
        const { error } = await supabase
          .from('chapters')
          .update({ pages })
          .eq('id', ch.id);

        if (!error) {
          filledCount++;
          console.log(`✓ [Worker ${WORKER_ID}] "${s.title}" Ch. ${ch.chapter_number} -> ${pages.length} pages`);
        }
      }
      await delay(250);
    }

    console.log(`[Worker ${WORKER_ID}] Finished "${s.title}": filled ${filledCount}/${emptyChapters.length}`);
    await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
  }

  console.log(`Worker ${WORKER_ID} complete.`);
}

runWorker().catch((err) => {
  console.error('Fatal crash:', err);
  process.exit(1);
});
