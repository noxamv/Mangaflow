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

function cleanNum(val) {
  if (val == null) return null;
  const str = String(val).trim().toLowerCase();
  if (str === 'prologue' || str === 'oneshot' || str === 'intro') return 0;
  const chMatch = str.match(/(?:chapter|ch\.?)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (chMatch) return parseFloat(parseFloat(chMatch[1]).toFixed(2));
  const stripped = str.replace(/(?:vol\.?|volume)\s*[0-9]+/gi, '');
  const match = stripped.match(/[0-9]+(?:\.[0-9]+)?/);
  return match ? parseFloat(parseFloat(match[0]).toFixed(2)) : null;
}

function toKey(num) {
  if (num === null || isNaN(num)) return null;
  return Number.isInteger(num) ? String(num) : String(parseFloat(num.toFixed(2)));
}

// ---------------------------------------------------------------------------
// Source 1: ComicK
// ---------------------------------------------------------------------------
async function searchComicK(title) {
  const url = `https://api.comick.io/v1.0/search?q=${encodeURIComponent(title)}&limit=1&type=comic`;
  const json = await fetchJson(url);
  const item = json?.[0];
  if (!item?.hid) return null;
  return { hid: item.hid, title: item.title, md_titles: item.md_titles };
}

async function getComicKMap(comicHid) {
  const map = new Map();
  let page = 1;

  while (page <= 40) {
    const url = `https://api.comick.io/comic/${comicHid}/chapters?lang=en&page=${page}&limit=100`;
    const json = await fetchJson(url);
    if (!json?.chapters?.length) break;

    for (const item of json.chapters) {
      const chNum = cleanNum(item.chap);
      const key = toKey(chNum);
      if (key !== null && item.hid) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item.hid);
      }
    }

    if (json.chapters.length < 100) break;
    page++;
    await delay(120);
  }

  return map;
}

async function getComicKPages(chapterHid) {
  const json = await fetchJson(`https://api.comick.io/chapter/${chapterHid}`);
  if (!json?.chapter?.images?.length) return null;
  return json.chapter.images
    .filter((img) => img.url)
    .map((img) => (img.url.startsWith('http') ? img.url : `https://meo3.comick.pictures/${img.url}`));
}

// ---------------------------------------------------------------------------
// Source 2: MangaDex
// ---------------------------------------------------------------------------
async function searchMangaDex(title) {
  const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(
    title
  )}&limit=1&order[relevance]=desc&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
  const json = await fetchJson(url);
  return json?.data?.[0]?.id || null;
}

async function getMangaDexMap(mangaId) {
  const map = new Map();
  let offset = 0;
  const limit = 100;

  while (offset <= 1200) {
    const url = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&limit=${limit}&offset=${offset}&order[chapter]=desc`;
    const json = await fetchJson(url);
    if (!json?.data?.length) break;

    for (const item of json.data) {
      if (item.attributes?.externalUrl) continue;
      const chNum = cleanNum(item.attributes?.chapter);
      const key = toKey(chNum);
      if (key !== null) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item.id);
      }
    }

    offset += limit;
    if (offset >= (json.total || 0)) break;
    await delay(150);
  }

  return map;
}

async function getMangaDexPages(chapterId) {
  const meta = await fetchJson(`https://api.mangadex.org/at-home/server/${chapterId}`);
  if (!meta?.baseUrl || !meta?.chapter?.data?.length) return null;
  const { baseUrl, chapter } = meta;
  return chapter.data.map((file) => `${baseUrl}/data/${chapter.hash}/${file}`);
}

// ---------------------------------------------------------------------------
// Source 3: MangaPill
// ---------------------------------------------------------------------------
async function searchMangaPill(title) {
  const url = `https://mangapill.com/search?q=${encodeURIComponent(title)}`;
  const html = await fetchHtml(url);
  if (!html) return null;
  const match = html.match(/href="\/manga\/([0-9]+\/[^"]+)"/i);
  return match ? match[1] : null;
}

async function getMangaPillMap(mangaSlug) {
  const map = new Map();
  const url = `https://mangapill.com/manga/${mangaSlug}`;
  const html = await fetchHtml(url);
  if (!html) return map;

  const regex = /href="\/chapters\/([^"]+)"[^>]*>.*?chapter\s*([0-9]+(?:\.[0-9]+)?)/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const chId = match[1];
    const chNum = cleanNum(match[2]);
    const key = toKey(chNum);
    if (key !== null) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(chId);
    }
  }

  return map;
}

async function getMangaPillPages(chapterSlug) {
  const html = await fetchHtml(`https://mangapill.com/chapters/${chapterSlug}`);
  if (!html) return null;
  const matches = [...html.matchAll(/data-src="([^"]+)"/g)];
  if (!matches.length) return null;
  return matches.map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// Multi-Source Candidate Aggregator
// ---------------------------------------------------------------------------
async function buildUnifiedChapterMap(series) {
  const unifiedMap = new Map();

  const queries = [series.title];
  if (series.english_title && series.english_title !== series.title) {
    queries.push(series.english_title);
  }

  const mergeCandidate = (key, type, id) => {
    if (!unifiedMap.has(key)) unifiedMap.set(key, []);
    unifiedMap.get(key).push({ type, id });
  };

  for (const q of queries) {
    const meta = await searchComicK(q);
    if (meta?.hid) {
      const ckMap = await getComicKMap(meta.hid);
      for (const [k, ids] of ckMap.entries()) {
        for (const id of ids) mergeCandidate(k, 'comick', id);
      }
      if (ckMap.size > 0) break;
    }
    await delay(120);
  }

  for (const q of queries) {
    const mdId = await searchMangaDex(q);
    if (mdId) {
      const mdMap = await getMangaDexMap(mdId);
      for (const [k, ids] of mdMap.entries()) {
        for (const id of ids) mergeCandidate(k, 'mangadex', id);
      }
      if (mdMap.size > 0) break;
    }
    await delay(120);
  }

  for (const q of queries.slice(0, 2)) {
    const mpSlug = await searchMangaPill(q);
    if (mpSlug) {
      const mpMap = await getMangaPillMap(mpSlug);
      for (const [k, ids] of mpMap.entries()) {
        for (const id of ids) mergeCandidate(k, 'mangapill', id);
      }
      if (mpMap.size > 0) break;
    }
    await delay(120);
  }

  return unifiedMap;
}

// ---------------------------------------------------------------------------
// Worker Pass: Prioritized by User Follows & Missing Panels
// ---------------------------------------------------------------------------
async function runWorker() {
  const startTime = Date.now();
  const MAX_RUNTIME_MS = 13 * 60 * 1000;

  console.log(`[Worker ${WORKER_ID}/${TOTAL_WORKERS}] Unified Engine Initialized.`);

  // Pull candidates prioritized by oldest sync
  const { data: allSeries } = await supabase
    .from('series')
    .select('id, title, slug, english_title, synonyms, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(40);

  if (!allSeries?.length) return;

  const assigned = allSeries.filter((_, idx) => idx % TOTAL_WORKERS === WORKER_ID - 1);
  console.log(`[Worker ${WORKER_ID}] Assigned ${assigned.length} candidate series.`);

  for (const s of assigned) {
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      console.log(`[Worker ${WORKER_ID}] 13-minute safety limit reached. Completing run.`);
      break;
    }

    await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);

    console.log(`\n[Worker ${WORKER_ID}] Syncing "${s.title}"...`);
    const unifiedMap = await buildUnifiedChapterMap(s);
    console.log(`[Worker ${WORKER_ID}] Discovered ${unifiedMap.size} unique chapters online.`);

    if (unifiedMap.size === 0) continue;

    const { data: existingChapters } = await supabase
      .from('chapters')
      .select('id, chapter_number, pages')
      .eq('series_id', s.id);

    const existingMap = new Map();
    for (const ex of existingChapters || []) {
      const key = toKey(cleanNum(ex.chapter_number));
      if (key !== null) existingMap.set(key, ex);
    }

    let addedCount = 0;
    let repairedCount = 0;

    for (const [key, candidates] of unifiedMap.entries()) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) break;

      const chNum = parseFloat(key);
      const existing = existingMap.get(key);

      if (existing && Array.isArray(existing.pages) && existing.pages.length > 0) {
        continue;
      }

      let pages = null;
      for (const cand of candidates) {
        try {
          if (cand.type === 'comick') pages = await getComicKPages(cand.id);
          else if (cand.type === 'mangadex') pages = await getMangaDexPages(cand.id);
          else if (cand.type === 'mangapill') pages = await getMangaPillPages(cand.id);
          if (pages && pages.length > 0) break;
        } catch {}
      }

      if (!pages || pages.length === 0) continue;

      if (existing) {
        await supabase.from('chapters').update({ pages }).eq('id', existing.id);
        repairedCount++;
      } else {
        await supabase.from('chapters').insert({
          series_id: s.id,
          chapter_number: chNum,
          title: `Chapter ${chNum}`,
          pages,
        });
        addedCount++;
      }

      await delay(120);
    }

    console.log(
      `✓ [Worker ${WORKER_ID}] "${s.title}": Repaired ${repairedCount} empty chapters, Added ${addedCount} new chapters!`
    );
  }

  console.log(`[Worker ${WORKER_ID}] Worker pass finished.`);
}

runWorker().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});
