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
  return String(num);
}

// ---------------------------------------------------------------------------
// Source 1: MangaDex
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

  while (true) {
    const url = `https://api.mangadex.org/chapter?manga=${mangaId}&translatedLanguage[]=en&limit=${limit}&offset=${offset}&order[chapter]=desc`;
    const json = await fetchJson(url);
    if (!json?.data?.length) break;

    for (const item of json.data) {
      const chNum = cleanNum(item.attributes?.chapter);
      const key = toKey(chNum);
      if (key !== null && !map.has(key)) {
        map.set(key, item.id);
      }
    }

    offset += limit;
    if (offset >= (json.total || 0) || offset >= 600) break;
    await delay(200);
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
// Source 2: ComicK
// ---------------------------------------------------------------------------
async function searchComicK(title) {
  const url = `https://api.comick.io/v1.0/search?q=${encodeURIComponent(
    title
  )}&limit=1&type=comic`;
  const json = await fetchJson(url);
  const item = json?.[0];
  if (!item?.hid) return null;
  return { hid: item.hid, title: item.title, md_titles: item.md_titles };
}

async function getComicKMap(comicHid) {
  const map = new Map();
  let page = 1;

  while (page <= 6) {
    const url = `https://api.comick.io/comic/${comicHid}/chapters?lang=en&page=${page}&limit=100`;
    const json = await fetchJson(url);
    if (!json?.chapters?.length) break;

    for (const item of json.chapters) {
      const chNum = cleanNum(item.chap);
      const key = toKey(chNum);
      if (key !== null && !map.has(key) && item.hid) {
        map.set(key, item.hid);
      }
    }

    if (json.chapters.length < 100) break;
    page++;
    await delay(150);
  }

  return map;
}

async function getComicKPages(chapterHid) {
  const json = await fetchJson(`https://api.comick.io/chapter/${chapterHid}`);
  if (!json?.chapter?.images?.length) return null;
  return json.chapter.images
    .filter((img) => img.url)
    .map((img) => img.url);
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
    if (key !== null && !map.has(key)) {
      map.set(key, chId);
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
// Multi-Source Chapter Aggregator
// ---------------------------------------------------------------------------
async function buildUnifiedChapterMap(series) {
  const unifiedMap = new Map();

  const queries = [series.title];
  if (series.english_title && series.english_title !== series.title) {
    queries.push(series.english_title);
  }

  const mergeMap = (sourceMap, type) => {
    for (const [key, id] of sourceMap.entries()) {
      if (!unifiedMap.has(key)) {
        unifiedMap.set(key, []);
      }
      unifiedMap.get(key).push({ type, id });
    }
  };

  for (const q of queries) {
    const mdId = await searchMangaDex(q);
    if (mdId) {
      const mdMap = await getMangaDexMap(mdId);
      for (const [k, v] of mdMap.entries()) {
        if (!unifiedMap.has(k)) unifiedMap.set(k, []);
        unifiedMap.get(k).push({ type: 'mangadex', id: v });
      }
      if (mdMap.size > 0) break;
    }
    await delay(120);
  }

  for (const q of queries) {
    const meta = await searchComicK(q);
    if (meta?.hid) {
      if (Array.isArray(meta.md_titles) && meta.md_titles.length > 0) {
        const synList = meta.md_titles.map((t) => t.title).filter(Boolean);
        await supabase
          .from('series')
          .update({
            english_title: series.english_title || meta.title || series.title,
            synonyms: synList.length > 0 ? synList : series.synonyms,
          })
          .eq('id', series.id);
      }

      const ckMap = await getComicKMap(meta.hid);
      for (const [k, v] of ckMap.entries()) {
        if (!unifiedMap.has(k)) unifiedMap.set(k, []);
        unifiedMap.get(k).push({ type: 'comick', id: v });
      }
      if (ckMap.size > 0) break;
    }
    await delay(120);
  }

  if (unifiedMap.size < 5) {
    for (const q of queries.slice(0, 2)) {
      const mpSlug = await searchMangaPill(q);
      if (mpSlug) {
        const mpMap = await getMangaPillMap(mpSlug);
        for (const [k, v] of mpMap.entries()) {
          if (!unifiedMap.has(k)) unifiedMap.set(k, []);
          unifiedMap.get(k).push({ type: 'mangapill', id: v });
        }
        if (mpMap.size > 0) break;
      }
      await delay(120);
    }
  }

  return unifiedMap;
}

// ---------------------------------------------------------------------------
// Worker Execution with Safety Time Limits & Candidate Caps
// ---------------------------------------------------------------------------
async function runWorker() {
  const startTime = Date.now();
  const MAX_RUNTIME_MS = 13 * 60 * 1000; // 13-minute safety limit before GitHub's 15m timeout

  console.log(`[Worker ${WORKER_ID}/${TOTAL_WORKERS}] Multi-Source Ingestion Initialized.`);

  const { data: allSeries } = await supabase
    .from('series')
    .select('id, title, slug, source_url, english_title, native_title, synonyms, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(40); // 8 candidate series per worker per run to prevent timeout bloat

  if (!allSeries?.length) return;

  const assigned = allSeries.filter((_, idx) => idx % TOTAL_WORKERS === WORKER_ID - 1);
  console.log(`[Worker ${WORKER_ID}] Assigned ${assigned.length} candidate series.`);

  for (const s of assigned) {
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      console.log(`[Worker ${WORKER_ID}] Reached time budget. Exiting cleanly for next pass.`);
      break;
    }

    await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);

    console.log(`\n[Worker ${WORKER_ID}] Checking "${s.title}"...`);
    const unifiedMap = await buildUnifiedChapterMap(s);
    console.log(`[Worker ${WORKER_ID}] Found online: ${unifiedMap.size} chapters.`);

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
    let filledCount = 0;

    for (const [key, candidates] of unifiedMap.entries()) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`[Worker ${WORKER_ID}] Time limit reached inside series loop. Wrapping up.`);
        break;
      }

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
        filledCount++;
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
      `✓ [Worker ${WORKER_ID}] "${s.title}": Repaired ${filledCount} empty, Inserted ${addedCount} brand new chapters!`
    );
  }

  console.log(`[Worker ${WORKER_ID}] Worker run complete.`);
}

runWorker().catch((err) => {
  console.error('Fatal crash:', err);
  process.exit(1);
});
