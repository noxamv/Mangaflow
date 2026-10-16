import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_ID = parseInt(process.env.WORKER_ID || '1', 10);
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '1', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Referer: 'https://mangadex.org/',
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, options = {}) {
  try {
    const res = await fetch(url, { headers: HEADERS, ...options });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

// 1. Safe float comparison to match "1.00" with "1"
function matchChapterNum(a, b) {
  if (a == null || b == null) return false;
  return Math.abs(parseFloat(a) - parseFloat(b)) < 0.001;
}

// 2. Series Source Resolver with Flagship Locks
async function resolveAnySource(title, slug) {
  const lower = (slug || title).toLowerCase();

  if (lower.includes('lookism')) {
    return {
      source: 'comick',
      hid: '00-lookism',
      slug: 'lookism',
    };
  }

  if (lower.includes('omniscient') || lower.includes('orv') || lower.includes('dokja')) {
    return {
      source: 'comick',
      hid: 'omniscient-readers-viewpoint',
      slug: 'omniscient-readers-viewpoint',
    };
  }

  if (lower === 'lord-of-the-mysteries' || (lower.includes('mysteries') && !lower.includes('wheel'))) {
    return {
      source: 'mangadex',
      id: 'd8f93318-7b9e-4d43-9828-568eb2a2491a',
    };
  }

  if (lower.includes('wheel-of-destiny') || lower.includes('wheel of destiny')) {
    return {
      source: 'comick',
      hid: 'P6w1V',
      slug: 'the-lord-of-the-wheel-of-destiny',
    };
  }

  const mdSearch = await fetchJson(
    `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1`
  );
  if (mdSearch?.data?.[0]?.id) {
    return { source: 'mangadex', id: mdSearch.data[0].id };
  }

  const ckSearch = await fetchJson(
    `https://api.comick.fun/v1.0/search?q=${encodeURIComponent(title)}&limit=1`
  );
  if (ckSearch?.[0]?.hid) {
    return { source: 'comick', hid: ckSearch[0].hid, slug: ckSearch[0].slug };
  }

  return null;
}

// 3. MangaDex Panel Fetcher
async function getMangaDexPages(seriesSourceId, chapterNum) {
  const feed = await fetchJson(
    `https://api.mangadex.org/manga/${seriesSourceId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=100`
  );
  if (!feed?.data?.length) return null;

  const target = feed.data.find((c) => matchChapterNum(c.attributes?.chapter, chapterNum));
  if (!target) return null;

  const atHome = await fetchJson(`https://api.mangadex.org/at-home/server/${target.id}`);
  if (!atHome?.baseUrl || !atHome?.chapter?.data?.length) return null;

  const { baseUrl, chapter } = atHome;
  return chapter.data.map((file) => `${baseUrl}/data/${chapter.hash}/${file}`);
}

// 4. ComicK Panel Fetcher
async function getComicKPages(hid, chapterNum) {
  const listData = await fetchJson(
    `https://api.comick.fun/comic/${hid}/chapters?lang=en&limit=100`
  );
  if (!listData?.chapters?.length) return null;

  const target = listData.chapters.find((c) => matchChapterNum(c.chap, chapterNum));
  if (!target?.hid) return null;

  const chapData = await fetchJson(`https://api.comick.fun/chapter/${target.hid}`);
  if (!chapData?.chapter?.images?.length) return null;

  return chapData.chapter.images.map((img) =>
    img.url.startsWith('http') ? img.url : `https://meo.comick.pictures/${img.url}`
  );
}

// 5. Main Parallel Engine
async function runWorker() {
  console.log(`Starting Worker ${WORKER_ID} of ${TOTAL_WORKERS}`);

  const { data: allSeries, error } = await supabase
    .from('series')
    .select('id, title, slug, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(30);

  if (error || !allSeries?.length) {
    console.log('No series found.');
    return;
  }

  const assignedSeries = allSeries.filter((_, idx) => idx % TOTAL_WORKERS === WORKER_ID - 1);
  console.log(`Worker ${WORKER_ID} assigned ${assignedSeries.length} series.`);

  for (const s of assignedSeries) {
    console.log(`\n[Worker ${WORKER_ID}] Auditing: "${s.title}" (${s.slug})`);

    const sourceInfo = await resolveAnySource(s.title, s.slug);
    if (!sourceInfo) {
      console.log(`No valid source mapping for "${s.title}".`);
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    // Safely capture empty text[] rows ([] or null)
    const { data: rawChapters } = await supabase
      .from('chapters')
      .select('id, chapter_number, pages')
      .eq('series_id', s.id)
      .order('chapter_number', { ascending: true })
      .limit(1000);

    const emptyChapters = (rawChapters || [])
      .filter((ch) => !ch.pages || ch.pages.length === 0)
      .slice(0, 40);

    if (!emptyChapters.length) {
      console.log(`No empty chapters for "${s.title}".`);
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    console.log(`Found ${emptyChapters.length} empty chapters. Backfilling panels...`);

    const CHUNK_SIZE = 4;
    for (let i = 0; i < emptyChapters.length; i += CHUNK_SIZE) {
      const chunk = emptyChapters.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (ch) => {
          let pages = null;
          if (sourceInfo.source === 'mangadex') {
            pages = await getMangaDexPages(sourceInfo.id, ch.chapter_number);
          } else if (sourceInfo.source === 'comick') {
            pages = await getComicKPages(sourceInfo.hid, ch.chapter_number);
          }

          if (pages && pages.length > 0) {
            await supabase
              .from('chapters')
              .update({ pages: pages })
              .eq('id', ch.id);
            console.log(`✓ [Worker ${WORKER_ID}] Filled "${s.title}" Ch. ${ch.chapter_number} (${pages.length} panels)`);
          }
        })
      );

      await delay(250);
    }

    await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
  }

  console.log(`Worker ${WORKER_ID} complete.`);
}

runWorker().catch((err) => {
  console.error('Fatal worker error:', err);
  process.exit(1);
});
