import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_ID = parseInt(process.env.WORKER_ID || '1', 10);
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '5', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function fetchJson(url, options = {}) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { 
      headers: HEADERS, 
      signal: controller.signal,
      ...options 
    });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchHtml(url) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(url, { 
      headers: HEADERS, 
      signal: controller.signal 
    });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function cleanNum(val) {
  if (val == null) return null;
  const match = String(val).match(/[0-9]+(\.[0-9]+)?/);
  return match ? parseFloat(match[0]) : null;
}

function stripAccents(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9가-힣ぁ-んァ-ヶ一-龯\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSearchCandidates(series) {
  const candidates = [];
  const add = (txt) => {
    if (!txt) return;
    const clean = stripAccents(txt);
    if (clean.length > 2 && !candidates.includes(clean)) candidates.push(clean);
  };

  // 1. English title first
  add(series.english_title);
  add(series.title);

  // 2. Native Korean/Japanese/Chinese titles
  add(series.native_title);

  // 3. Alternative synonyms
  if (Array.isArray(series.synonyms)) {
    series.synonyms.forEach(add);
  } else if (typeof series.synonyms === 'string') {
    try {
      const parsed = JSON.parse(series.synonyms);
      if (Array.isArray(parsed)) parsed.forEach(add);
    } catch {
      add(series.synonyms);
    }
  }
  return candidates;
}

// -------------------------------------------------------------
// SOURCE 1: ComicK API (Full scanlation archives)
// -------------------------------------------------------------
async function searchComicK(query) {
  const data = await fetchJson(`https://api.comick.io/v1.0/search?q=${encodeURIComponent(query)}&limit=1`);
  return data?.[0]?.hid || null;
}

async function getComicKMap(hid) {
  const map = new Map();
  let page = 1;
  while (page <= 40) {
    const data = await fetchJson(`https://api.comick.io/comic/${hid}/chapters?lang=en&page=${page}&limit=100`);
    if (!data?.chapters?.length) break;

    for (const ch of data.chapters) {
      const num = cleanNum(ch.chap);
      if (num !== null) {
        if (!map.has(num)) map.set(num, []);
        map.get(num).push({ type: 'comick', id: ch.hid });
      }
    }
    if (data.chapters.length < 100) break;
    page++;
    await delay(90);
  }
  return map;
}

async function getComicKPages(hid) {
  const data = await fetchJson(`https://api.comick.io/chapter/${hid}`);
  if (data?.chapter?.images?.length) {
    return data.chapter.images.map((img) => (img.url.startsWith('http') ? img.url : `https://meo3.comick.pictures/${img.url}`));
  }
  return null;
}

// -------------------------------------------------------------
// SOURCE 2: MangaDex API (Filters out MangaPlus redirects)
// -------------------------------------------------------------
async function searchMangaDex(query) {
  const data = await fetchJson(`https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=1`);
  return data?.data?.[0]?.id || null;
}

async function getMangaDexMap(mangaId) {
  const map = new Map();
  let offset = 0;
  while (offset < 1000) {
    const url = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage%5B%5D=en&order%5Bchapter%5D=asc&limit=100&offset=${offset}`;
    const data = await fetchJson(url);
    if (!data?.data?.length) break;

    for (const ch of data.data) {
      // Skip empty MangaPlus external links
      if (ch.attributes?.externalUrl) continue;

      const num = cleanNum(ch.attributes?.chapter);
      if (num !== null && !map.has(num)) {
        map.set(num, [{ type: 'mangadex', id: ch.id }]);
      }
    }
    if (data.data.length < 100) break;
    offset += 100;
    await delay(100);
  }
  return map;
}

async function getMangaDexPages(chapterId) {
  const atHome = await fetchJson(`https://api.mangadex.org/at-home/server/${chapterId}`);
  if (!atHome?.baseUrl || !atHome?.chapter?.data?.length) return null;
  const { baseUrl, chapter } = atHome;
  return chapter.data.map((f) => `${baseUrl}/data/${chapter.hash}/${f}`);
}

// -------------------------------------------------------------
// SOURCE 3: MangaPill (Aggregator without MangaPlus restrictions)
// -------------------------------------------------------------
async function searchMangaPill(query) {
  const html = await fetchHtml(`https://mangapill.com/search?q=${encodeURIComponent(query)}`);
  if (!html) return null;
  const match = html.match(/href="\/manga\/([0-9]+\/[^"]+)"/i);
  return match ? match[1] : null;
}

async function getMangaPillMap(mangaSlug) {
  const map = new Map();
  const html = await fetchHtml(`https://mangapill.com/manga/${mangaSlug}`);
  if (!html) return map;

  const regex = /href="\/chapters\/([0-9]+-[0-9]+\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const chapUrlId = match[1];
    const chapText = match[2];
    const num = cleanNum(chapText);
    if (num !== null && !map.has(num)) {
      map.set(num, [{ type: 'mangapill', id: chapUrlId }]);
    }
  }
  return map;
}

async function getMangaPillPages(chapUrlId) {
  const html = await fetchHtml(`https://mangapill.com/chapters/${chapUrlId}`);
  if (!html) return null;
  const pages = [];
  const regex = /<img[^>]+data-src="([^">]+)"/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    pages.push(match[1]);
  }
  return pages.length > 0 ? pages : null;
}

// -------------------------------------------------------------
// SOURCE 4: Consumet / MangaHere Fallback
// -------------------------------------------------------------
async function searchConsumet(query) {
  const data = await fetchJson(`https://api.consumet.org/manga/mangahere/${encodeURIComponent(query)}`);
  return data?.results?.[0]?.id || null;
}

async function getConsumetMap(mangaId) {
  const map = new Map();
  const data = await fetchJson(`https://api.consumet.org/manga/mangahere/info?id=${encodeURIComponent(mangaId)}`);
  if (!data?.chapters?.length) return map;

  for (const ch of data.chapters) {
    const num = cleanNum(ch.chapterNumber || ch.id);
    if (num !== null && !map.has(num)) {
      map.set(num, [{ type: 'consumet', id: ch.id }]);
    }
  }
  return map;
}

async function getConsumetPages(chapterId) {
  const data = await fetchJson(`https://api.consumet.org/manga/mangahere/read?chapterId=${encodeURIComponent(chapterId)}`);
  if (Array.isArray(data)) {
    return data.map((img) => img.img || img.url).filter(Boolean);
  }
  return null;
}

// -------------------------------------------------------------
// Master Cascade: Compiles Maximum Chapters Across All Sources
// -------------------------------------------------------------
async function buildUnifiedChapterMap(series) {
  const queries = getSearchCandidates(series);
  const unifiedMap = new Map();

  // Helper to merge and extend chapters
  const mergeMap = (newMap) => {
    for (const [chNum, list] of newMap.entries()) {
      if (!unifiedMap.has(chNum)) {
        unifiedMap.set(chNum, list);
      } else {
        unifiedMap.get(chNum).push(...list);
      }
    }
  };

  // 1. Direct MangaDex UUID if stored in DB
  const isMdUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str || '');
  const mdId = isMdUuid(series.source_url) ? series.source_url : (isMdUuid(series.slug) ? series.slug : null);

  if (mdId) {
    const mdMap = await getMangaDexMap(mdId);
    mergeMap(mdMap);
  }

  // 2. Query ComicK across candidate names
  for (const q of queries) {
    const ckHid = await searchComicK(q);
    if (ckHid) {
      const ckMap = await getComicKMap(ckHid);
      mergeMap(ckMap);
      if (ckMap.size > 0) break;
    }
    await delay(100);
  }

  // 3. Query MangaPill across candidate names
  for (const q of queries.slice(0, 2)) {
    const mpSlug = await searchMangaPill(q);
    if (mpSlug) {
      const mpMap = await getMangaPillMap(mpSlug);
      mergeMap(mpMap);
      if (mpMap.size > 0) break;
    }
    await delay(100);
  }

  // 4. Query Consumet across candidate names if chapters are still sparse
  if (unifiedMap.size < 5) {
    for (const q of queries.slice(0, 2)) {
      const cId = await searchConsumet(q);
      if (cId) {
        const cMap = await getConsumetMap(cId);
        mergeMap(cMap);
        if (cMap.size > 0) break;
      }
      await delay(100);
    }
  }

  return unifiedMap;
}

// -------------------------------------------------------------
// Main Worker Loop
// -------------------------------------------------------------
async function runWorker() {
  console.log(`[Worker ${WORKER_ID}/${TOTAL_WORKERS}] Comprehensive Multi-Platform Engine Running.`);

  const { data: emptySample } = await supabase
    .from('chapters')
    .select('series_id')
    .or('pages.is.null,pages.eq.{}')
    .limit(500);

  if (!emptySample?.length) {
    console.log('All chapters in the database are fully populated!');
    return;
  }

  const distinctSeriesIds = [...new Set(emptySample.map((c) => c.series_id))];

  const { data: allSeries } = await supabase
    .from('series')
    .select('id, title, slug, source_url, english_title, native_title, synonyms, updated_at')
    .in('id', distinctSeriesIds)
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(200);

  if (!allSeries?.length) return;

  const assigned = allSeries.filter((_, idx) => idx % TOTAL_WORKERS === WORKER_ID - 1);
  console.log(`[Worker ${WORKER_ID}] Assigned ${assigned.length} series to audit.`);

  for (const s of assigned) {
    const { data: emptyChapters } = await supabase
      .from('chapters')
      .select('id, chapter_number')
      .eq('series_id', s.id)
      .or('pages.is.null,pages.eq.{}')
      .order('chapter_number', { ascending: true })
      .limit(100);

    if (!emptyChapters?.length) {
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    console.log(`\n[Worker ${WORKER_ID}] Auditing "${s.title}" (${emptyChapters.length} empty chapters)...`);

    const unifiedMap = await buildUnifiedChapterMap(s);
    console.log(`[Worker ${WORKER_ID}] Unified maximum chapters found online: ${unifiedMap.size}`);

    if (unifiedMap.size === 0) {
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    let filledCount = 0;
    const CHUNK_SIZE = 3;

    for (let i = 0; i < emptyChapters.length; i += CHUNK_SIZE) {
      const chunk = emptyChapters.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (ch) => {
          const targetNum = cleanNum(ch.chapter_number);
          if (targetNum === null || !unifiedMap.has(targetNum)) return;

          const candidates = unifiedMap.get(targetNum);
          let pages = null;

          for (const cand of candidates) {
            try {
              if (cand.type === 'comick') {
                pages = await getComicKPages(cand.id);
              } else if (cand.type === 'mangadex') {
                pages = await getMangaDexPages(cand.id);
              } else if (cand.type === 'mangapill') {
                pages = await getMangaPillPages(cand.id);
              } else if (cand.type === 'consumet') {
                pages = await getConsumetPages(cand.id);
              }
              if (pages && pages.length > 0) break;
            } catch {}
          }

          if (pages && pages.length > 0) {
            const { error: upErr } = await supabase
              .from('chapters')
              .update({ pages })
              .eq('id', ch.id);

            if (!upErr) {
              filledCount++;
              console.log(`✓ [Worker ${WORKER_ID}] "${s.title}" Ch. ${ch.chapter_number} -> ${pages.length} panels`);
            }
          }
        })
      );

      await delay(200);
    }

    console.log(`[Worker ${WORKER_ID}] Result for "${s.title}": filled ${filledCount}/${emptyChapters.length}`);
    await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
  }

  console.log(`[Worker ${WORKER_ID}] Worker pass completed.`);
}

runWorker().catch((err) => {
  console.error('Fatal crash:', err);
  process.exit(1);
});
