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
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, options = {}) {
  try {
    const res = await fetch(url, { headers: HEADERS, ...options });
    if (!res.ok) {
      if (res.status === 429) console.warn(`[HTTP 429 Rate Limit] ${url}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    return null;
  }
}

// Cleans pinyin accents, tone marks, and special symbols
function stripAccents(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Float matcher: accurately links "526.00", "526", and "ch. 526"
function matchChapterNum(a, b) {
  if (a == null || b == null) return false;
  const cleanA = String(a).replace(/[^0-9.]/g, '');
  const cleanDb = String(b).replace(/[^0-9.]/g, '');
  if (!cleanA || !cleanDb) return false;
  return Math.abs(parseFloat(cleanA) - parseFloat(cleanDb)) < 0.001;
}

// Master Title Mapping for High-Volume Series
async function resolveAnySource(title, slug) {
  const lower = (slug || title).toLowerCase();
  const clean = stripAccents(title).toLowerCase();

  // Flagships & Top Backlog Series Explicit Locks
  if (lower.includes('lookism')) {
    return { source: 'comick', hid: '00-lookism' };
  }
  if (lower.includes('omniscient') || lower.includes('dokja')) {
    return { source: 'comick', hid: 'omniscient-readers-viewpoint' };
  }
  if (clean.includes('wu lian dian feng') || clean.includes('martial peak')) {
    return { source: 'comick', hid: 'martial-peak' };
  }
  if (clean.includes('fangkai nage') || clean.includes('release that witch')) {
    return { source: 'comick', hid: 'release-that-witch' };
  }
  if (clean.includes('tieji gangbing') || clean.includes('iron ladies')) {
    return { source: 'comick', hid: 'iron-ladies' };
  }
  if (clean.includes('doupo cangqiong') || clean.includes('battle through the heavens')) {
    return { source: 'comick', hid: 'battle-through-the-heavens' };
  }
  if (clean.includes('yao shen ji') || clean.includes('tales of demons and gods')) {
    return { source: 'comick', hid: 'tales-of-demons-and-gods' };
  }
  if (clean.includes('wo zao jiu budangle') || clean.includes('hero i quit a long time ago')) {
    return { source: 'comick', hid: 'hero-i-quit-a-long-time-ago' };
  }
  if (clean.includes('meitantei conan') || clean.includes('detective conan')) {
    return { source: 'comick', hid: 'detective-conan' };
  }
  if (clean.includes('wan zha chao huang') || clean.includes('cheating men must die')) {
    return { source: 'comick', hid: 'cheating-men-must-die' };
  }
  if (lower === 'lord-of-the-mysteries' || (lower.includes('mysteries') && !lower.includes('wheel'))) {
    return { source: 'mangadex', id: 'd8f93318-7b9e-4d43-9828-568eb2a2491a' };
  }
  if (lower.includes('wheel-of-destiny') || lower.includes('wheel of destiny')) {
    return { source: 'comick', hid: 'P6w1V' };
  }

  // ComicK Search Fallback with cleaned accent-free title
  const cleanTitle = stripAccents(title);
  const ck = await fetchJson(`https://api.comick.fun/v1.0/search?q=${encodeURIComponent(cleanTitle)}&limit=1`);
  if (ck?.[0]?.hid) return { source: 'comick', hid: ck[0].hid };

  // MangaDex Search Fallback
  const md = await fetchJson(`https://api.mangadex.org/manga?title=${encodeURIComponent(cleanTitle)}&limit=1`);
  if (md?.data?.[0]?.id) return { source: 'mangadex', id: md.data[0].id };

  return null;
}

// ComicK Deep Pagination (supports up to 4,000 chapters for series like Martial Peak)
async function getComicKChapterMap(hid) {
  const map = new Map();
  let page = 1;
  const maxPages = 40;

  while (page <= maxPages) {
    const data = await fetchJson(`https://api.comick.fun/comic/${hid}/chapters?lang=en&page=${page}&limit=100`);
    if (!data?.chapters?.length) break;

    for (const ch of data.chapters) {
      if (ch.chap && ch.hid && !map.has(ch.chap)) {
        map.set(ch.chap, ch.hid);
      }
    }
    if (data.chapters.length < 100) break;
    page++;
    await delay(120);
  }
  return map;
}

async function getComicKPagesByHid(chapterHid) {
  const chapData = await fetchJson(`https://api.comick.fun/chapter/${chapterHid}`);
  if (!chapData?.chapter?.images?.length) return null;
  return chapData.chapter.images.map((img) =>
    img.url.startsWith('http') ? img.url : `https://meo.comick.pictures/${img.url}`
  );
}

// MangaDex Chapter Map with Deep Offset Support
async function getMangaDexChapterMap(mangaId) {
  const map = new Map();
  let offset = 0;
  const limit = 100;

  while (offset < 1000) {
    const data = await fetchJson(
      `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=${limit}&offset=${offset}`
    );
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

async function getMangaDexPagesByChapterId(chapterId) {
  const atHome = await fetchJson(`https://api.mangadex.org/at-home/server/${chapterId}`);
  if (!atHome?.baseUrl || !atHome?.chapter?.data?.length) return null;
  const { baseUrl, chapter } = atHome;
  return chapter.data.map((f) => `${baseUrl}/data/${chapter.hash}/${f}`);
}

async function runWorker() {
  console.log(`Starting Worker ${WORKER_ID} of ${TOTAL_WORKERS}`);

  // Fetch candidate series ordered by updated_at ASC NULLS FIRST
  const { data: allSeries, error } = await supabase
    .from('series')
    .select('id, title, slug, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(40);

  if (error || !allSeries?.length) {
    console.log('No series found.');
    return;
  }

  // Modulo division to split tasks evenly across the 5 workers
  const assigned = allSeries.filter((_, idx) => idx % TOTAL_WORKERS === WORKER_ID - 1);
  console.log(`Worker ${WORKER_ID} assigned ${assigned.length} series in this cycle.`);

  for (const s of assigned) {
    // Zero-Egress Query: only select empty chapter rows
    const { data: emptyChapters } = await supabase
      .from('chapters')
      .select('id, chapter_number')
      .eq('series_id', s.id)
      .or('pages.is.null,pages.eq.{}')
      .order('chapter_number', { ascending: true })
      .limit(50);

    if (!emptyChapters?.length) {
      // Touch timestamp to cycle to the back of the queue
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    console.log(`\n[Worker ${WORKER_ID}] Processing "${s.title}" (${emptyChapters.length} empty chapters)...`);

    const sourceInfo = await resolveAnySource(s.title, s.slug);
    if (!sourceInfo) {
      console.log(`[Worker ${WORKER_ID}] No source found for "${s.title}". Touching updated_at.`);
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    // Build complete online chapter map once per series
    let chapterMap = new Map();
    if (sourceInfo.source === 'mangadex') {
      chapterMap = await getMangaDexChapterMap(sourceInfo.id);
    } else if (sourceInfo.source === 'comick') {
      chapterMap = await getComicKChapterMap(sourceInfo.hid);
    }

    console.log(`[Worker ${WORKER_ID}] Online source mapped ${chapterMap.size} available chapters.`);

    let filledCount = 0;
    for (const ch of emptyChapters) {
      let targetKey = null;
      for (const [key] of chapterMap.entries()) {
        if (matchChapterNum(key, ch.chapter_number)) {
          targetKey = key;
          break;
        }
      }

      if (!targetKey) continue;

      const targetId = chapterMap.get(targetKey);
      let pages = null;

      if (sourceInfo.source === 'mangadex') {
        pages = await getMangaDexPagesByChapterId(targetId);
      } else if (sourceInfo.source === 'comick') {
        pages = await getComicKPagesByHid(targetId);
      }

      if (pages && pages.length > 0) {
        const { error: upErr } = await supabase
          .from('chapters')
          .update({ pages })
          .eq('id', ch.id);

        if (!upErr) {
          filledCount++;
          console.log(`✓ [Worker ${WORKER_ID}] "${s.title}" Ch. ${ch.chapter_number} -> ${pages.length} pages`);
        }
      }
      await delay(200);
    }

    console.log(`[Worker ${WORKER_ID}] Result for "${s.title}": filled ${filledCount}/${emptyChapters.length}`);
    await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
  }

  console.log(`Worker ${WORKER_ID} complete.`);
}

runWorker().catch((err) => {
  console.error('Fatal worker crash:', err);
  process.exit(1);
});
