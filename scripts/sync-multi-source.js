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
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function fetchJson(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      clearTimeout(id);

      if (res.status === 429) {
        await delay(3000 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      if (attempt === retries) return null;
      await delay(800);
    }
  }
  return null;
}

async function fetchHtml(url) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Robust numerical chapter parser: Handles decimals (312.1), fractions, Prologues, and skips Volumes
function cleanNum(val) {
  if (val == null) return null;
  const str = String(val).trim().toLowerCase();

  if (str === 'prologue' || str === 'oneshot' || str === 'intro') return 0;

  // 1. Prioritize explicit chapter keyword (e.g., "Chapter 312.1" or "Ch. 15.5")
  const chMatch = str.match(/(?:chapter|ch\.?)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (chMatch) return parseFloat(chMatch[1]);

  // 2. Remove volume references first to avoid picking volume numbers (e.g. "Vol. 2 Ch. 15")
  const stripped = str.replace(/(?:vol\.?|volume)\s*[0-9]+/gi, '');
  const match = stripped.match(/[0-9]+(?:\.[0-9]+)?/);
  return match ? parseFloat(match[0]) : null;
}

// Standardizes chapter keys for map lookups (e.g., 312 -> "312", 312.1 -> "312.1")
function toKey(num) {
  if (num == null) return null;
  return Number.isInteger(num) ? String(num) : String(parseFloat(num.toFixed(2)));
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

  add(series.english_title);
  add(series.title);
  add(series.native_title);

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
// SOURCES: ComicK, MangaDex, MangaPill
// -------------------------------------------------------------
async function searchComicK(query) {
  const data = await fetchJson(`https://api.comick.io/v1.0/search?q=${encodeURIComponent(query)}&limit=1`);
  return data?.[0]?.hid || null;
}

async function getComicKMap(hid) {
  const map = new Map();
  let page = 1;
  while (page <= 35) {
    const data = await fetchJson(`https://api.comick.io/comic/${hid}/chapters?lang=en&page=${page}&limit=100`);
    if (!data?.chapters?.length) break;

    for (const ch of data.chapters) {
      const num = cleanNum(ch.chap);
      const key = toKey(num);
      if (key !== null) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ type: 'comick', id: ch.hid });
      }
    }
    if (data.chapters.length < 100) break;
    page++;
    await delay(120);
  }
  return map;
}

async function getComicKPages(hid) {
  const data = await fetchJson(`https://api.comick.io/chapter/${hid}`);
  if (data?.chapter?.images?.length) {
    return data.chapter.images.map((img) =>
      img.url.startsWith('http') ? img.url : `https://meo3.comick.pictures/${img.url}`
    );
  }
  return null;
}

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
      // Avoid dead external MangaPlus links
      if (ch.attributes?.externalUrl) continue;

      const num = cleanNum(ch.attributes?.chapter);
      const key = toKey(num);
      if (key !== null) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ type: 'mangadex', id: ch.id });
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
    const num = cleanNum(match[2]);
    const key = toKey(num);
    if (key !== null) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ type: 'mangapill', id: match[1] });
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
// Unified Map Builder with Multi-Key Support
// -------------------------------------------------------------
async function buildUnifiedChapterMap(series) {
  const queries = getSearchCandidates(series);
  const unifiedMap = new Map();

  const mergeMap = (newMap) => {
    for (const [key, list] of newMap.entries()) {
      if (!unifiedMap.has(key)) unifiedMap.set(key, list);
      else unifiedMap.get(key).push(...list);
    }
  };

  const isMdUuid = (str) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str || '');
  const mdId = isMdUuid(series.source_url) ? series.source_url : (isMdUuid(series.slug) ? series.slug : null);

  if (mdId) {
    const mdMap = await getMangaDexMap(mdId);
    mergeMap(mdMap);
  }

  for (const q of queries) {
    const ckHid = await searchComicK(q);
    if (ckHid) {
      const ckMap = await getComicKMap(ckHid);
      mergeMap(ckMap);
      if (ckMap.size > 0) break;
    }
    await delay(120);
  }

  if (unifiedMap.size < 5) {
    for (const q of queries.slice(0, 2)) {
      const mpSlug = await searchMangaPill(q);
      if (mpSlug) {
        const mpMap = await getMangaPillMap(mpSlug);
        mergeMap(mpMap);
        if (mpMap.size > 0) break;
      }
      await delay(120);
    }
  }

  return unifiedMap;
}

// -------------------------------------------------------------
// Race-Free Worker Loop
// -------------------------------------------------------------
async function runWorker() {
  console.log(`[Worker ${WORKER_ID}/${TOTAL_WORKERS}] Dynamic Engine Initialized.`);

  const { data: emptySample } = await supabase
    .from('chapters')
    .select('series_id')
    .or('pages.is.null,pages.eq.{}')
    .limit(1000);

  if (!emptySample?.length) {
    console.log('🎉 No empty chapters remain in the database!');
    return;
  }

  const distinctSeriesIds = [...new Set(emptySample.map((c) => c.series_id))];

  // Fetch candidate series ordered by oldest updated
  const { data: allSeries } = await supabase
    .from('series')
    .select('id, title, slug, source_url, english_title, native_title, synonyms, updated_at')
    .in('id', distinctSeriesIds)
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(100);

  if (!allSeries?.length) return;

  // Dedicated worker partition
  const assigned = allSeries.filter((_, idx) => idx % TOTAL_WORKERS === WORKER_ID - 1);
  console.log(`[Worker ${WORKER_ID}] Assigned ${assigned.length} candidate series.`);

  for (const s of assigned) {
    // 1. IMMEDIATE LOCK: Update timestamp now so no other worker picks up this series
    await supabase
      .from('series')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', s.id);

    const { data: emptyChapters } = await supabase
      .from('chapters')
      .select('id, chapter_number')
      .eq('series_id', s.id)
      .or('pages.is.null,pages.eq.{}')
      .order('chapter_number', { ascending: true })
      .limit(100);

    if (!emptyChapters?.length) continue;

    console.log(`\n[Worker ${WORKER_ID}] Auditing "${s.title}" (${emptyChapters.length} empty chapters to fill)...`);

    const unifiedMap = await buildUnifiedChapterMap(s);
    console.log(`[Worker ${WORKER_ID}] Playable chapters available online: ${unifiedMap.size}`);

    if (unifiedMap.size === 0) continue;

    let filledCount = 0;

    for (const ch of emptyChapters) {
      const num = cleanNum(ch.chapter_number);
      if (num === null) continue;

      const key = toKey(num);

      // Support direct key match or floating-point tolerance lookup
      let candidates = unifiedMap.get(key);
      if (!candidates) {
        for (const [mapKey, list] of unifiedMap.entries()) {
          const mapNum = parseFloat(mapKey);
          if (Math.abs(mapNum - num) < 0.05) {
            candidates = list;
            break;
          }
        }
      }

      if (!candidates || candidates.length === 0) continue;

      let pages = null;

      for (const cand of candidates) {
        try {
          if (cand.type === 'comick') pages = await getComicKPages(cand.id);
          else if (cand.type === 'mangadex') pages = await getMangaDexPages(cand.id);
          else if (cand.type === 'mangapill') pages = await getMangaPillPages(cand.id);
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

      await delay(250);
    }

    console.log(`[Worker ${WORKER_ID}] Result for "${s.title}": filled ${filledCount}/${emptyChapters.length}`);
  }

  console.log(`[Worker ${WORKER_ID}] Worker pass complete.`);
}

runWorker().catch((err) => {
  console.error('Fatal crash:', err);
  process.exit(1);
});
