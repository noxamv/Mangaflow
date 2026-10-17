import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_ID = parseInt(process.env.WORKER_ID || '1', 10);
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '5', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

// Convert "1.00", "01", "Ch. 526" strictly to 1, 526
function parseChapterNumber(val) {
  if (val == null) return null;
  const match = String(val).match(/[0-9]+(\.[0-9]+)?/);
  return match ? parseFloat(match[0]) : null;
}

// Strip pinyin tones and symbols so search endpoints understand the title
function cleanTitle(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Hardcoded IDs for your largest backlogs to avoid search misses
async function resolveSeries(title, slug) {
  const normTitle = cleanTitle(title);
  const normSlug = (slug || '').toLowerCase();

  // Flagship & High Volume Series Hard-Locks
  if (normTitle.includes('blue lock') || normSlug.includes('blue-lock')) {
    return { source: 'comick', hid: '00-blue-lock' };
  }
  if (normTitle.includes('lookism') || normSlug.includes('lookism')) {
    return { source: 'comick', hid: '00-lookism' };
  }
  if (normTitle.includes('wu lian dian feng') || normTitle.includes('martial peak')) {
    return { source: 'comick', hid: 'martial-peak' };
  }
  if (normTitle.includes('omniscient') || normTitle.includes('dokja')) {
    return { source: 'comick', hid: 'omniscient-readers-viewpoint' };
  }
  if (normTitle.includes('fangkai nage') || normTitle.includes('release that witch')) {
    return { source: 'comick', hid: 'release-that-witch' };
  }
  if (normTitle.includes('tieji gangbing') || normTitle.includes('iron ladies')) {
    return { source: 'comick', hid: 'iron-ladies' };
  }
  if (normTitle.includes('doupo cangqiong') || normTitle.includes('battle through the heavens')) {
    return { source: 'comick', hid: 'battle-through-the-heavens' };
  }
  if (normTitle.includes('yao shen ji') || normTitle.includes('tales of demons and gods')) {
    return { source: 'comick', hid: 'tales-of-demons-and-gods' };
  }
  if (normTitle.includes('meitantei conan') || normTitle.includes('detective conan')) {
    return { source: 'comick', hid: 'detective-conan' };
  }
  if (normTitle.includes('wan zha chao huang') || normTitle.includes('cheating men must die')) {
    return { source: 'comick', hid: 'cheating-men-must-die' };
  }
  if (normTitle.includes('ragnarok') && normTitle.includes('level up')) {
    return { source: 'comick', hid: 'solo-leveling-ragnarok' };
  }
  if (normTitle.includes('wheel of destiny')) {
    return { source: 'comick', hid: 'P6w1V' };
  }
  if (normSlug === 'lord-of-the-mysteries') {
    return { source: 'mangadex', id: 'd8f93318-7b9e-4d43-9828-568eb2a2491a' };
  }

  // Dynamic ComicK Search Fallback
  const ckData = await fetchJson(`https://api.comick.io/v1.0/search?q=${encodeURIComponent(normTitle)}&limit=1`);
  if (ckData?.[0]?.hid) {
    return { source: 'comick', hid: ckData[0].hid };
  }

  // Dynamic MangaDex Search Fallback
  const mdData = await fetchJson(`https://api.mangadex.org/manga?title=${encodeURIComponent(normTitle)}&limit=1`);
  if (mdData?.data?.[0]?.id) {
    return { source: 'mangadex', id: mdData.data[0].id };
  }

  return null;
}

// ComicK Feed (Paginates up to 3,000 chapters)
async function fetchComicKChapterMap(hid) {
  const map = new Map();
  let page = 1;
  while (page <= 30) {
    const data = await fetchJson(`https://api.comick.io/comic/${hid}/chapters?lang=en&page=${page}&limit=100`);
    if (!data?.chapters?.length) break;

    for (const c of data.chapters) {
      const num = parseChapterNumber(c.chap);
      if (num !== null && !map.has(num)) {
        map.set(num, c.hid);
      }
    }
    if (data.chapters.length < 100) break;
    page++;
    await delay(120);
  }
  return map;
}

async function getComicKPanels(chapterHid) {
  const data = await fetchJson(`https://api.comick.io/chapter/${chapterHid}`);
  if (!data?.chapter?.images?.length) return null;
  return data.chapter.images.map((img) =>
    img.url.startsWith('http') ? img.url : `https://meo.comick.pictures/${img.url}`
  );
}

// MangaDex Feed (URL query encoded)
async function fetchMangaDexChapterMap(mangaId) {
  const map = new Map();
  let offset = 0;
  while (offset < 1000) {
    const url = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage%5B%5D=en&order%5Bchapter%5D=asc&limit=100&offset=${offset}`;
    const data = await fetchJson(url);
    if (!data?.data?.length) break;

    for (const c of data.data) {
      const num = parseChapterNumber(c.attributes?.chapter);
      if (num !== null && !map.has(num)) {
        map.set(num, c.id);
      }
    }
    if (data.data.length < 100) break;
    offset += 100;
    await delay(120);
  }
  return map;
}

async function getMangaDexPanels(chapterId) {
  const atHome = await fetchJson(`https://api.mangadex.org/at-home/server/${chapterId}`);
  if (!atHome?.baseUrl || !atHome?.chapter?.data?.length) return null;
  const { baseUrl, chapter } = atHome;
  return chapter.data.map((file) => `${baseUrl}/data/${chapter.hash}/${file}`);
}

async function execute() {
  console.log(`[Worker ${WORKER_ID}/${TOTAL_WORKERS}] Initialized.`);

  // Pull 50 series ordered by oldest updated
  const { data: seriesList, error: sErr } = await supabase
    .from('series')
    .select('id, title, slug, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(50);

  if (sErr || !seriesList?.length) {
    console.log('No series found to audit.');
    return;
  }

  // Assign distinct series across workers
  const mySeries = seriesList.filter((_, idx) => idx % TOTAL_WORKERS === WORKER_ID - 1);
  console.log(`[Worker ${WORKER_ID}] Assigned ${mySeries.length} series.`);

  for (const s of mySeries) {
    // Zero-Egress Empty Chapters Query
    const { data: emptyChapters, error: cErr } = await supabase
      .from('chapters')
      .select('id, chapter_number')
      .eq('series_id', s.id)
      .or('pages.is.null,pages.eq.{}')
      .order('chapter_number', { ascending: true })
      .limit(60);

    if (cErr) {
      console.error(`[Worker ${WORKER_ID}] Query error on "${s.title}":`, cErr.message);
      continue;
    }

    if (!emptyChapters?.length) {
      // Rotate out of active front queue
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    console.log(`\n[Worker ${WORKER_ID}] Auditing "${s.title}" (${emptyChapters.length} empty chapters)...`);

    const source = await resolveSeries(s.title, s.slug);
    if (!source) {
      console.log(`[Worker ${WORKER_ID}] No source located for "${s.title}". Moving to back of queue.`);
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    let chapterMap = new Map();
    if (source.source === 'comick') {
      chapterMap = await fetchComicKChapterMap(source.hid);
    } else if (source.source === 'mangadex') {
      chapterMap = await fetchMangaDexChapterMap(source.id);
    }

    console.log(`[Worker ${WORKER_ID}] Source mapped ${chapterMap.size} available chapters online.`);

    if (chapterMap.size === 0) {
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    let filled = 0;
    const CHUNK_SIZE = 3;

    for (let i = 0; i < emptyChapters.length; i += CHUNK_SIZE) {
      const chunk = emptyChapters.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (ch) => {
          const num = parseChapterNumber(ch.chapter_number);
          if (num === null || !chapterMap.has(num)) return;

          const chapterId = chapterMap.get(num);
          let panels = null;

          if (source.source === 'comick') panels = await getComicKPanels(chapterId);
          else if (source.source === 'mangadex') panels = await getMangaDexPanels(chapterId);

          if (panels && panels.length > 0) {
            const { error: upErr } = await supabase
              .from('chapters')
              .update({ pages: panels })
              .eq('id', ch.id);

            if (!upErr) {
              filled++;
              console.log(`✓ [Worker ${WORKER_ID}] "${s.title}" Ch. ${ch.chapter_number} -> ${panels.length} panels`);
            } else {
              console.error(`[Worker ${WORKER_ID}] DB Write Failure Ch. ${ch.chapter_number}:`, upErr.message);
            }
          }
        })
      );

      await delay(250);
    }

    console.log(`[Worker ${WORKER_ID}] Finished "${s.title}": ${filled}/${emptyChapters.length} populated.`);
    await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
  }

  console.log(`[Worker ${WORKER_ID}] Pass completed.`);
}

execute().catch((err) => {
  console.error('Worker crash:', err);
  process.exit(1);
});
