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
  'Accept': 'application/json, text/plain, */*',
};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function fetchJson(url, options = {}) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(url, { 
      headers: HEADERS, 
      signal: controller.signal,
      ...options 
    });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
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

// Extract search queries prioritizing English, Native, and Synonyms
function getSearchCandidates(series) {
  const candidates = [];

  const add = (txt) => {
    if (!txt) return;
    const clean = stripAccents(txt);
    if (clean.length > 2 && !candidates.includes(clean)) {
      candidates.push(clean);
    }
  };

  // 1. English title first priority
  add(series.english_title);
  add(series.title);

  // 2. Native language titles (Korean, Japanese, Chinese)
  add(series.native_title);

  // 3. Alternative names / synonyms
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

  // 4. Slug as fallback
  if (series.slug && !series.slug.includes('-')) {
    add(series.slug);
  }

  return candidates;
}

// ---------------------------------------------------------
// SOURCE 1: ComicK API (Primary scanlation index)
// ---------------------------------------------------------
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
    await delay(100);
  }
  return map;
}

async function getComicKPages(hid) {
  const data = await fetchJson(`https://api.comick.io/chapter/${hid}`);
  if (data?.chapter?.images?.length) {
    return data.chapter.images.map((img) => {
      if (img.url.startsWith('http')) return img.url;
      return `https://meo3.comick.pictures/${img.url}`;
    });
  }
  return null;
}

// ---------------------------------------------------------
// SOURCE 2: MangaDex API (Official / Community fallback)
// ---------------------------------------------------------
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
      const num = cleanNum(ch.attributes?.chapter);
      if (num !== null && !map.has(num)) {
        map.set(num, [{ type: 'mangadex', id: ch.id }]);
      }
    }
    if (data.data.length < 100) break;
    offset += 100;
    await delay(120);
  }
  return map;
}

async function getMangaDexPages(chapterId) {
  const atHome = await fetchJson(`https://api.mangadex.org/at-home/server/${chapterId}`);
  if (!atHome?.baseUrl || !atHome?.chapter?.data?.length) return null;
  const { baseUrl, chapter } = atHome;
  return chapter.data.map((f) => `${baseUrl}/data/${chapter.hash}/${f}`);
}

// ---------------------------------------------------------
// SOURCE 3: Third-Party / Aggregator Fallback (Consumet API)
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// Cascade Resolver & Unified Chapter Map Builder
// ---------------------------------------------------------
async function buildUnifiedChapterMap(series) {
  const queries = getSearchCandidates(series);
  const unifiedMap = new Map();

  const isMdUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str || '');
  let mdId = isMdUuid(series.source_url) ? series.source_url : (isMdUuid(series.slug) ? series.slug : null);

  // 1. Try MangaDex direct UUID if present
  if (mdId) {
    const mdMap = await getMangaDexMap(mdId);
    for (const [chNum, list] of mdMap.entries()) {
      unifiedMap.set(chNum, list);
    }
  }

  // 2. Cascade across candidate titles for ComicK
  for (const q of queries) {
    if (unifiedMap.size > 200) break; // Already have substantial chapters
    const ckHid = await searchComicK(q);
    if (ckHid) {
      const ckMap = await getComicKMap(ckHid);
      for (const [chNum, list] of ckMap.entries()) {
        // ComicK often has scanlations with higher chapter counts; merge/replace
        unifiedMap.set(chNum, list);
      }
      if (ckMap.size > 0) break;
    }
    await delay(120);
  }

  // 3. Fallback to MangaDex search if still empty
  if (unifiedMap.size === 0) {
    for (const q of queries) {
      const foundMdId = await searchMangaDex(q);
      if (foundMdId) {
        const mdMap = await getMangaDexMap(foundMdId);
        for (const [chNum, list] of mdMap.entries()) {
          unifiedMap.set(chNum, list);
        }
        if (mdMap.size > 0) break;
      }
      await delay(120);
    }
  }

  // 4. Fallback to Third-Party Aggregator if still empty
  if (unifiedMap.size === 0) {
    for (const q of queries.slice(0, 2)) {
      const cId = await searchConsumet(q);
      if (cId) {
        const cMap = await getConsumetMap(cId);
        for (const [chNum, list] of cMap.entries()) {
          unifiedMap.set(chNum, list);
        }
        if (cMap.size > 0) break;
      }
      await delay(150);
    }
  }

  return unifiedMap;
}

// ---------------------------------------------------------
// Main Worker Execution
// ---------------------------------------------------------
async function runWorker() {
  console.log(`[Worker ${WORKER_ID}/${TOTAL_WORKERS}] Multi-Source Deep Backfill Engine Initialized.`);

  // Sample distinct series that currently have empty chapters
  const { data: emptySample } = await supabase
    .from('chapters')
    .select('series_id')
    .or('pages.is.null,pages.eq.{}')
    .limit(400);

  if (!emptySample?.length) {
    console.log('No empty chapters found in the database. All series completed!');
    return;
  }

  const distinctSeriesIds = [...new Set(emptySample.map((c) => c.series_id))];

  // Fetch candidate series with full title metadata
  const { data: allSeries } = await supabase
    .from('series')
    .select('id, title, slug, source_url, source, english_title, native_title, synonyms, updated_at')
    .in('id', distinctSeriesIds)
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(150);

  if (!allSeries?.length) return;

  const assigned = allSeries.filter((_, idx) => idx % TOTAL_WORKERS === WORKER_ID - 1);
  console.log(`[Worker ${WORKER_ID}] Assigned ${assigned.length} series to audit.`);

  for (const s of assigned) {
    // Fetch up to 100 empty chapters for this series
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

    console.log(`\n[Worker ${WORKER_ID}] Auditing "${s.title}" (${emptyChapters.length} empty chapters to fill)...`);

    const unifiedMap = await buildUnifiedChapterMap(s);
    console.log(`[Worker ${WORKER_ID}] Available chapters online across all providers: ${unifiedMap.size}`);

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

          // Attempt to extract pages from available provider candidates
          for (const cand of candidates) {
            try {
              if (cand.type === 'comick') {
                pages = await getComicKPages(cand.id);
              } else if (cand.type === 'mangadex') {
                pages = await getMangaDexPages(cand.id);
              } else if (cand.type === 'consumet') {
                pages = await getConsumetPages(cand.id);
              }
              if (pages && pages.length > 0) break;
            } catch {
              // Try next provider
            }
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

      await delay(250);
    }

    console.log(`[Worker ${WORKER_ID}] Result for "${s.title}": filled ${filledCount}/${emptyChapters.length}`);
    await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
  }

  console.log(`[Worker ${WORKER_ID}] Worker pass finished.`);
}

runWorker().catch((err) => {
  console.error('Fatal worker crash:', err);
  process.exit(1);
});
