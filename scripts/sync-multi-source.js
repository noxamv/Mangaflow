import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_ID = parseInt(process.env.WORKER_ID || '1', 10);
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '5', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Fatal: Missing SUPABASE credentials.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: null },
});

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Parallel execution worker pool
async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = [];
  const executing = new Set();
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= poolLimit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(ret);
}

async function fetchJson(url) {
  for (let i = 0; i < 2; i++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      clearTimeout(id);
      if (res.ok) return await res.json();
      if (res.status === 429) await delay(2000);
    } catch {
      await delay(400);
    }
  }
  return null;
}

async function fetchHtml(url) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(id);
    if (res.ok) return await res.text();
  } catch {}
  return null;
}

// ---------------- NUMBER NORMALIZATION & DEDUPLICATION ----------------
function cleanNum(val) {
  if (val == null) return null;
  const str = String(val).trim().toLowerCase();
  if (['prologue', 'oneshot', 'intro', 'teaser'].includes(str)) return 0;
  
  const match = str.match(/[0-9]+(?:\.[0-9]+)?/);
  if (!match) return null;
  const parsed = parseFloat(match[0]);
  return isNaN(parsed) ? null : parseFloat(parsed.toFixed(2));
}

function toKey(num) {
  if (num === null || isNaN(num)) return null;
  // Standardize 12.0 -> "12", 12.5 -> "12.5"
  return Number.isInteger(num) ? String(num) : String(parseFloat(num.toFixed(2)));
}

function isNovelKeyword(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('(novel)') ||
    lower.includes('[novel]') ||
    lower.includes('- novel') ||
    lower.includes('web novel') ||
    lower.includes('light novel')
  );
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// ---------------- COMICK ----------------
async function searchComicK(title) {
  const json = await fetchJson(
    `https://api.comick.io/v1.0/search?q=${encodeURIComponent(title)}&limit=6&type=comic`
  );
  if (!Array.isArray(json) || json.length === 0) return null;

  const comic = json.find((c) => {
    const rawTitle = (c.title || '').toLowerCase();
    const slug = (c.slug || '').toLowerCase();
    if (c.comic_type === 'novel' || c.type === 'novel') return false;
    if (rawTitle.includes('(novel)') || rawTitle.includes('[novel]') || slug.includes('-novel')) {
      return false;
    }
    return true;
  });

  return comic?.hid || json[0]?.hid || null;
}

async function getComicKChapters(hid) {
  const map = new Map();
  let page = 1;
  while (page <= 25) {
    const json = await fetchJson(`https://api.comick.io/comic/${hid}/chapters?lang=en&page=${page}&limit=100`);
    if (!json?.chapters?.length) break;
    for (const item of json.chapters) {
      const key = toKey(cleanNum(item.chap));
      if (key && item.hid) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ id: item.hid, type: 'comick', order: 1 });
      }
    }
    if (json.chapters.length < 100) break;
    page++;
    await delay(60);
  }
  return map;
}

async function getComicKPages(hid) {
  const json = await fetchJson(`https://api.comick.io/chapter/${hid}`);
  if (!json?.chapter?.images?.length) return null;
  return json.chapter.images
    .filter((img) => img.url && typeof img.url === 'string')
    .map((img) => (img.url.startsWith('http') ? img.url : `https://meo3.comick.pictures/${img.url}`));
}

// ---------------- MANGADEX ----------------
async function searchMangaDex(title) {
  const json = await fetchJson(
    `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=5&order[relevance]=desc`
  );
  if (!json?.data?.length) return null;

  const valid = json.data.find((m) => {
    const enTitle = (m.attributes?.title?.en || Object.values(m.attributes?.title || {})[0] || '').toLowerCase();
    return !enTitle.includes('(novel)') && !enTitle.includes('[novel]');
  });

  return valid?.id || json.data[0]?.id || null;
}

async function getMangaDexChapters(mangaId) {
  const map = new Map();
  let offset = 0;
  const limit = 100;
  while (offset <= 1000) {
    const json = await fetchJson(
      `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&limit=${limit}&offset=${offset}&order[chapter]=desc`
    );
    if (!json?.data?.length) break;
    for (const item of json.data) {
      if (item.attributes?.externalUrl) continue;
      const key = toKey(cleanNum(item.attributes?.chapter));
      if (key) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ id: item.id, type: 'mangadex', order: 2 });
      }
    }
    offset += limit;
    if (offset >= (json.total || 0)) break;
    await delay(60);
  }
  return map;
}

async function getMangaDexPages(chapterId) {
  const meta = await fetchJson(`https://api.mangadex.org/at-home/server/${chapterId}`);
  if (!meta?.baseUrl || !meta?.chapter?.data?.length) return null;
  return meta.chapter.data.map((file) => `${meta.baseUrl}/data/${meta.chapter.hash}/${file}`);
}

// ---------------- MANGAPILL ----------------
async function searchMangaPill(title) {
  const cleanTitle = title.replace(/['’]/g, '').trim();
  const html = await fetchHtml(`https://mangapill.com/search?q=${encodeURIComponent(cleanTitle)}`);
  const match = html?.match(/href="\/manga\/([0-9]+\/[^"]+)"/i);
  return match ? match[1] : null;
}

async function getMangaPillChapters(slug) {
  const map = new Map();
  const html = await fetchHtml(`https://mangapill.com/manga/${slug}`);
  if (!html) return map;
  const regex = /href="\/chapters\/([^"]+)"[^>]*>.*?chapter\s*([0-9]+(?:\.[0-9]+)?)/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const key = toKey(cleanNum(match[2]));
    if (key) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ id: match[1], type: 'mangapill', order: 3 });
    }
  }
  return map;
}

async function getMangaPillPages(chapterSlug) {
  const html = await fetchHtml(`https://mangapill.com/chapters/${chapterSlug}`);
  if (!html) return null;
  const matches = [...html.matchAll(/data-src="([^"]+)"/g)];
  return matches.length ? matches.map((m) => m[1]) : null;
}

// ---------------- MULTI-ALIAS DEDUPLICATING AGGREGATION ----------------
async function buildAggregatedChapterMap(searchTitles) {
  const unifiedMap = new Map();
  const checkedQueries = new Set();

  const merge = (map) => {
    for (const [k, cands] of map.entries()) {
      if (!unifiedMap.has(k)) unifiedMap.set(k, []);
      unifiedMap.get(k).push(...cands);
    }
  };

  const queryQueue = [];
  for (const raw of searchTitles) {
    if (!raw) continue;
    queryQueue.push(raw.trim());

    const stripped = raw.replace(/['’]/g, '').trim();
    if (stripped !== raw) queryQueue.push(stripped);

    if (raw.toLowerCase().includes('viewpoint')) {
      queryQueue.push(raw.replace(/viewpoint/gi, '').replace(/['’s]/g, '').trim());
    }
  }

  for (const query of queryQueue) {
    const clean = query.trim();
    if (clean.length < 2 || isNovelKeyword(clean) || checkedQueries.has(clean.toLowerCase())) {
      continue;
    }
    checkedQueries.add(clean.toLowerCase());

    const [ckHid, mdId, mpSlug] = await Promise.all([
      searchComicK(clean),
      searchMangaDex(clean),
      searchMangaPill(clean),
    ]);

    if (ckHid) merge(await getComicKChapters(ckHid));
    if (mdId) merge(await getMangaDexChapters(mdId));
    if (mpSlug) merge(await getMangaPillChapters(mpSlug));

    if (unifiedMap.size >= 40) break;
    await delay(60);
  }

  // Deduplicate candidates per chapter number and sort by source priority
  for (const [key, candidates] of unifiedMap.entries()) {
    const seen = new Set();
    const unique = [];
    for (const c of candidates) {
      const uKey = `${c.type}:${c.id}`;
      if (!seen.has(uKey)) {
        seen.add(uKey);
        unique.push(c);
      }
    }
    unique.sort((a, b) => (a.order || 9) - (b.order || 9));
    unifiedMap.set(key, unique);
  }

  return unifiedMap;
}

// ---------------- MAIN WORKER LOOP ----------------
async function processSeriesSync(s, startTime, MAX_RUNTIME_MS) {
  await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);

  const searchTitles = [s.english_title, s.title, s.native_title];
  if (Array.isArray(s.synonyms)) {
    searchTitles.push(...s.synonyms);
  } else if (typeof s.synonyms === 'string') {
    try {
      const parsed = JSON.parse(s.synonyms);
      if (Array.isArray(parsed)) searchTitles.push(...parsed);
      else searchTitles.push(s.synonyms);
    } catch {
      searchTitles.push(...s.synonyms.split(/[,;\n]/));
    }
  }

  console.log(`\n=> [${s.title}] Resolving comic releases across aliases...`);
  const unifiedMap = await buildAggregatedChapterMap(searchTitles);

  if (unifiedMap.size === 0) {
    console.log('   No online graphic releases matched.');
    return;
  }

  const { data: existingChapters } = await supabase
    .from('chapters')
    .select('id, chapter_number, pages')
    .eq('series_id', s.id);

  const existingMap = new Map();
  for (const ex of existingChapters || []) {
    const key = toKey(cleanNum(ex.chapter_number));
    if (key) existingMap.set(key, ex);
  }

  const tasks = [];
  for (const [key, candidates] of unifiedMap.entries()) {
    const chNum = parseFloat(key);
    // Sanity limit: manhwa chapters never legitimately exceed 350
    if (s.reading_mode === 'webtoon' && chNum > 350) continue;

    const existing = existingMap.get(key);
    // If the chapter already has a complete set of panels, skip it to avoid duplicate scan ingestion
    if (existing && Array.isArray(existing.pages) && existing.pages.length >= 5) {
      continue;
    }
    tasks.push({ key, candidates, existing, chNum });
  }

  if (tasks.length === 0) {
    console.log('   Already 100% up to date.');
    return;
  }

  let addedCount = 0;
  let repairedCount = 0;
  const upsertBatch = [];

  // Parallel pool fetching 5 chapters concurrently
  await asyncPool(5, tasks, async (task) => {
    if (Date.now() - startTime > MAX_RUNTIME_MS) return;

    let pages = null;
    for (const cand of task.candidates) {
      try {
        if (cand.type === 'comick') pages = await getComicKPages(cand.id);
        else if (cand.type === 'mangadex') pages = await getMangaDexPages(cand.id);
        else if (cand.type === 'mangapill') pages = await getMangaPillPages(cand.id);
        if (pages?.length > 0) break;
      } catch {}
    }

    if (!Array.isArray(pages) || pages.length === 0) return;

    const firstUrl = pages[0].toLowerCase();
    const isImage =
      firstUrl.includes('.jpg') ||
      firstUrl.includes('.jpeg') ||
      firstUrl.includes('.png') ||
      firstUrl.includes('.webp') ||
      firstUrl.includes('.avif') ||
      firstUrl.includes('meo3.comick') ||
      firstUrl.includes('mangadex.org');

    if (!isImage) return;

    let baseUrl = '';
    let compressedPages = pages;
    try {
      const urlObj = new URL(pages[0]);
      baseUrl = `${urlObj.protocol}//${urlObj.hostname}/`;
      compressedPages = pages.map((p) => (p.startsWith(baseUrl) ? p.replace(baseUrl, '') : p));
    } catch {}

    if (task.existing) {
      await supabase
        .from('chapters')
        .update({ base_url: baseUrl, pages: compressedPages })
        .eq('id', task.existing.id);
      repairedCount++;
    } else {
      upsertBatch.push({
        series_id: s.id,
        chapter_number: task.chNum,
        title: `Chapter ${task.chNum}`,
        base_url: baseUrl,
        pages: compressedPages,
      });
      addedCount++;
    }
  });

  // Bulk upsert against the unique (series_id, chapter_number) constraint
  if (upsertBatch.length > 0) {
    const { error: batchErr } = await supabase
      .from('chapters')
      .upsert(upsertBatch, { onConflict: 'series_id,chapter_number' });

    if (batchErr) {
      console.error('Batch upsert warning:', batchErr.message);
    }
  }

  console.log(`   + Added: ${addedCount} | Repaired: ${repairedCount}`);
}

async function runWorker() {
  const startTime = Date.now();
  const MAX_RUNTIME_MS = 12 * 60 * 1000;

  console.log(`[Worker ${WORKER_ID}/${TOTAL_WORKERS}] Booting Graphic-Only Deduplicating Engine...`);

  const { data: queue } = await supabase
    .from('series')
    .select('id, title, english_title, native_title, synonyms, reading_mode, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(200);

  const assignedSync = (queue || []).filter((_, idx) => (idx % TOTAL_WORKERS) + 1 === WORKER_ID);
  console.log(`[80% Sync Queue] Assigned ${assignedSync.length} series to Worker ${WORKER_ID}.`);

  for (const s of assignedSync) {
    if (Date.now() - startTime > MAX_RUNTIME_MS) break;
    await processSeriesSync(s, startTime, MAX_RUNTIME_MS);
  }

  console.log(`[Worker ${WORKER_ID}] Sync pass complete.`);
  process.exit(0);
}

runWorker().catch((err) => {
  console.error('Fatal engine failure:', err);
  process.exit(1);
});
