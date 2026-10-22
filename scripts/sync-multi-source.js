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

function cleanNum(val) {
  if (val == null) return null;
  const str = String(val).trim().toLowerCase();
  if (['prologue', 'oneshot', 'intro'].includes(str)) return 0;
  const match = str.match(/[0-9]+(?:\.[0-9]+)?/);
  return match ? parseFloat(parseFloat(match[0]).toFixed(2)) : null;
}

function toKey(num) {
  if (num === null || isNaN(num)) return null;
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

// ================= 1. COMICK: PERMANENT GRAPHIC ONLY =================
async function searchComicK(title) {
  // Pass strict comic_types filter parameter
  const json = await fetchJson(
    `https://api.comick.io/v1.0/search?q=${encodeURIComponent(title)}&limit=6&type=comic&comic_types=manga,manhwa,manhua`
  );
  if (!Array.isArray(json) || json.length === 0) return null;

  // Filter out any results that are text novels
  const validComics = json.filter((c) => {
    if (c.comic_type === 'novel' || c.type === 'novel') return false;
    if (isNovelKeyword(c.title)) return false;
    // Must be marked as manga, manhwa, or manhua
    return c.country === 'kr' || c.country === 'jp' || c.country === 'cn' || c.comic_types?.length > 0;
  });

  return validComics[0]?.hid || null;
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
        map.get(key).push({ id: item.hid, type: 'comick' });
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

// ================= 2. MANGADEX: STRICT COMIC FILTER =================
async function searchMangaDex(title) {
  const json = await fetchJson(
    `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=5&order[relevance]=desc&excludedTags[]=novel`
  );
  if (!json?.data?.length) return null;

  // Filter out any title with novel in its name
  const valid = json.data.filter((m) => {
    const enTitle = m.attributes?.title?.en || Object.values(m.attributes?.title || {})[0] || '';
    return !isNovelKeyword(enTitle);
  });

  return valid[0]?.id || null;
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
        map.get(key).push({ id: item.id, type: 'mangadex' });
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

// ================= 3. MANGAPILL: GRAPHIC ONLY =================
async function searchMangaPill(title) {
  if (isNovelKeyword(title)) return null;
  const html = await fetchHtml(`https://mangapill.com/search?q=${encodeURIComponent(title)}`);
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
      map.get(key).push({ id: match[1], type: 'mangapill' });
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

// ================= MULTI-ALIAS SEARCH & MERGE =================
async function buildAggregatedChapterMap(searchTitles) {
  const unifiedMap = new Map();
  const checkedQueries = new Set();

  const merge = (map) => {
    for (const [k, cands] of map.entries()) {
      if (!unifiedMap.has(k)) unifiedMap.set(k, []);
      unifiedMap.get(k).push(...cands);
    }
  };

  for (const rawQuery of searchTitles) {
    if (!rawQuery) continue;
    const cleanQuery = rawQuery.trim();
    if (cleanQuery.length < 2 || isNovelKeyword(cleanQuery) || checkedQueries.has(cleanQuery.toLowerCase())) {
      continue;
    }
    checkedQueries.add(cleanQuery.toLowerCase());

    const [ckHid, mdId, mpSlug] = await Promise.all([
      searchComicK(cleanQuery),
      searchMangaDex(cleanQuery),
      searchMangaPill(cleanQuery),
    ]);

    if (ckHid) merge(await getComicKChapters(ckHid));
    if (mdId) merge(await getMangaDexChapters(mdId));
    if (mpSlug) merge(await getMangaPillChapters(mpSlug));

    if (unifiedMap.size >= 40) break;
    await delay(60);
  }

  return unifiedMap;
}

// ================= NEW DISCOVERY (20% - GRAPHIC ONLY) =================
async function discoverNewTrendingSeries(count = 3) {
  console.log(`[Discovery] Checking upstream feeds for new comics/manhwa...`);
  const newDiscovered = [];

  try {
    const topComics = await fetchJson(
      'https://api.comick.io/top?type=trending&comic_types=manhwa,manga,manhua&accept_mature_content=true'
    );
    if (Array.isArray(topComics)) {
      for (const item of topComics) {
        if (!item.title || item.comic_type === 'novel' || isNovelKeyword(item.title)) continue;
        const slug = slugify(item.title);

        const { data: exists } = await supabase.from('series').select('id').eq('slug', slug).single();
        if (!exists) {
          const cover = item.md_covers?.[0]?.b2key
            ? `https://meo3.comick.pictures/${item.md_covers[0].b2key}`
            : null;

          const { data: inserted } = await supabase
            .from('series')
            .insert({
              title: item.title,
              english_title: item.title,
              slug: slug,
              synopsis: item.desc || 'Trending graphic release.',
              cover_image_url: cover,
              reading_mode: item.country === 'kr' ? 'webtoon' : 'manga',
              status: 'releasing',
              updated_at: new Date(0).toISOString(),
            })
            .select('id, title, english_title, synonyms, native_title')
            .single();

          if (inserted) {
            console.log(`   + Discovered & Indexed: ${inserted.title}`);
            newDiscovered.push(inserted);
            if (newDiscovered.length >= count) break;
          }
        }
      }
    }
  } catch (err) {
    console.error('Discovery error:', err.message);
  }

  return newDiscovered;
}

// ================= MAIN SYNC ENGINE =================
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
    // Hard sanity guard: Webtoons never legitimately exceed 300-350 chapters
    if (s.reading_mode === 'webtoon' && chNum > 350) continue;

    const existing = existingMap.get(key);
    if (existing && Array.isArray(existing.pages) && existing.pages.length > 0) {
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

    // STRICT CHECK: Must be a non-empty array of image panels
    if (!Array.isArray(pages) || pages.length === 0) return;

    // Reject if the page URLs do not look like graphic image files
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

  // Conflict-free upsert: updates existing chapters without throwing key duplicate exceptions
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

  console.log(`[Worker ${WORKER_ID}/${TOTAL_WORKERS}] Booting Graphic-Only Multi-Alias Engine...`);

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

  if (WORKER_ID === 1 && Date.now() - startTime < MAX_RUNTIME_MS) {
    console.log(`\n[20% Discovery Pass] Discovering new releases...`);
    const newSeries = await discoverNewTrendingSeries(3);
    for (const s of newSeries) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) break;
      await processSeriesSync(s, startTime, MAX_RUNTIME_MS);
    }
  }

  console.log(`[Worker ${WORKER_ID}] Sync pass complete.`);
  process.exit(0);
}

runWorker().catch((err) => {
  console.error('Fatal engine failure:', err);
  process.exit(1);
});
