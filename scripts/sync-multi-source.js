import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_ID = parseInt(process.env.WORKER_ID || '1', 10);
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '5', 10);

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
    if (!res.ok) {
      if (res.status === 429) {
        console.warn(`[HTTP 429 Throttle] ${url}`);
      }
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[Fetch Error] ${err.message} on ${url}`);
    return null;
  }
}

// Float matcher: accurately links "526.00", "526", and "ch. 526"
function matchChapterNum(apiChap, dbChap) {
  if (apiChap == null || dbChap == null) return false;
  const cleanApi = String(apiChap).replace(/[^0-9.]/g, '');
  const cleanDb = String(dbChap).replace(/[^0-9.]/g, '');
  if (!cleanApi || !cleanDb) return false;
  return Math.abs(parseFloat(cleanApi) - parseFloat(cleanDb)) < 0.001;
}

// Hardcoded Flagship Locks & Dynamic Search Resolver
async function resolveAnySource(title, slug) {
  const lower = (slug || title).toLowerCase();

  // Flagship Lock: Lookism
  if (lower.includes('lookism')) {
    return { source: 'comick', hid: '00-lookism', slug: 'lookism' };
  }

  // Flagship Lock: Omniscient Reader's Viewpoint
  if (lower.includes('omniscient') || lower.includes('orv') || lower.includes('dokja')) {
    return { source: 'comick', hid: 'omniscient-readers-viewpoint', slug: 'omniscient-readers-viewpoint' };
  }

  // Flagship Lock: Lord of the Mysteries
  if (lower === 'lord-of-the-mysteries' || (lower.includes('mysteries') && !lower.includes('wheel'))) {
    return { source: 'mangadex', id: 'd8f93318-7b9e-4d43-9828-568eb2a2491a' };
  }

  // Flagship Lock: The Lord of the Wheel of Destiny
  if (lower.includes('wheel-of-destiny') || lower.includes('wheel of destiny')) {
    return { source: 'comick', hid: 'P6w1V', slug: 'the-lord-of-the-wheel-of-destiny' };
  }

  // Dynamic MangaDex Lookup
  const mdSearch = await fetchJson(
    `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1`
  );
  if (mdSearch?.data?.[0]?.id) {
    return { source: 'mangadex', id: mdSearch.data[0].id };
  }

  // Dynamic ComicK Lookup Fallback
  const ckSearch = await fetchJson(
    `https://api.comick.fun/v1.0/search?q=${encodeURIComponent(title)}&limit=1`
  );
  if (ckSearch?.[0]?.hid) {
    return { source: 'comick', hid: ckSearch[0].hid, slug: ckSearch[0].slug };
  }

  return null;
}

// Targeted MangaDex Lookup by Chapter Number
async function getMangaDexPages(seriesSourceId, chapterNum) {
  const cleanNum = parseFloat(String(chapterNum).replace(/[^0-9.]/g, ''));
  if (isNaN(cleanNum)) return null;

  const feed = await fetchJson(
    `https://api.mangadex.org/manga/${seriesSourceId}/feed?translatedLanguage[]=en&chapter=${cleanNum}&limit=5`
  );
  if (!feed?.data?.length) return null;

  const target = feed.data[0];
  const atHome = await fetchJson(`https://api.mangadex.org/at-home/server/${target.id}`);
  if (!atHome?.baseUrl || !atHome?.chapter?.data?.length) return null;

  const { baseUrl, chapter } = atHome;
  return chapter.data.map((file) => `${baseUrl}/data/${chapter.hash}/${file}`);
}

// ComicK Lookup with Extended Chapter Coverage
async function getComicKPages(hid, chapterNum) {
  const listData = await fetchJson(
    `https://api.comick.fun/comic/${hid}/chapters?lang=en&limit=500`
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

// Parallel Worker Execution Engine
async function runWorker() {
  console.log(`Starting Worker ${WORKER_ID} of ${TOTAL_WORKERS}`);

  // Fetch top 50 candidates ordered by least recently updated
  const { data: allSeries, error } = await supabase
    .from('series')
    .select('id, title, slug, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(50);

  if (error || !allSeries?.length) {
    console.log('No series found to process.');
    return;
  }

  // Modulo partition across workers
  const assignedSeries = allSeries.filter((_, idx) => idx % TOTAL_WORKERS === WORKER_ID - 1);
  console.log(`Worker ${WORKER_ID} assigned ${assignedSeries.length} series in this pass.`);

  for (const s of assignedSeries) {
    console.log(`\n[Worker ${WORKER_ID}] Auditing: "${s.title}" (${s.slug})`);

    const sourceInfo = await resolveAnySource(s.title, s.slug);
    if (!sourceInfo) {
      console.log(`No valid source mapping for "${s.title}". Touching updated_at.`);
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    // Zero-Egress Query: only fetch id and chapter_number for empty chapters
    const { data: emptyChapters } = await supabase
      .from('chapters')
      .select('id, chapter_number')
      .eq('series_id', s.id)
      .or('pages.is.null,pages.eq.{}')
      .order('chapter_number', { ascending: true })
      .limit(50);

    if (!emptyChapters || emptyChapters.length === 0) {
      console.log(`No empty chapters for "${s.title}". Marking updated.`);
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    console.log(`Processing ${emptyChapters.length} empty chapters for "${s.title}" via ${sourceInfo.source}...`);

    let filledCount = 0;
    const CHUNK_SIZE = 3; // 3 concurrent requests to respect CDN limits

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
            const { error: updateError } = await supabase
              .from('chapters')
              .update({ pages: pages })
              .eq('id', ch.id);

            if (updateError) {
              console.error(`[Worker ${WORKER_ID}] DB Update Error Ch ${ch.chapter_number}:`, updateError.message);
            } else {
              filledCount++;
              console.log(`✓ [Worker ${WORKER_ID}] Filled "${s.title}" Ch. ${ch.chapter_number} (${pages.length} panels)`);
            }
          } else {
            console.log(`[Worker ${WORKER_ID}] Source returned 0 panels for "${s.title}" Ch. ${ch.chapter_number}`);
          }
        })
      );

      await delay(250); // 250ms spacing between chunk requests
    }

    console.log(`[Worker ${WORKER_ID}] Finished batch: ${filledCount}/${emptyChapters.length} chapters populated.`);
    await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
  }

  console.log(`Worker ${WORKER_ID} run complete.`);
}

runWorker().catch((err) => {
  console.error('Fatal worker crash:', err);
  process.exit(1);
});
