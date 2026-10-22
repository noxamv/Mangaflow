import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_ID = parseInt(process.env.WORKER_ID || '1', 10);
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '5', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing credentials.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  for (let i = 0; i < 2; i++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      clearTimeout(id);
      if (res.ok) return await res.json();
      if (res.status === 429) await delay(3000);
    } catch {
      await delay(800);
    }
  }
  return null;
}

async function fetchHtml(url) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
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

// ComicK
async function searchComicK(title) {
  const json = await fetchJson(`https://api.comick.io/v1.0/search?q=${encodeURIComponent(title)}&limit=1&type=comic`);
  return json?.[0]?.hid || null;
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
    await delay(120);
  }
  return map;
}

async function getComicKPages(hid) {
  const json = await fetchJson(`https://api.comick.io/chapter/${hid}`);
  if (!json?.chapter?.images?.length) return null;
  return json.chapter.images
    .filter((img) => img.url)
    .map((img) => (img.url.startsWith('http') ? img.url : `https://meo3.comick.pictures/${img.url}`));
}

// MangaDex
async function searchMangaDex(title) {
  const json = await fetchJson(`https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=1&order[relevance]=desc`);
  return json?.data?.[0]?.id || null;
}

async function getMangaDexChapters(mangaId) {
  const map = new Map();
  let offset = 0;
  const limit = 100;
  while (offset <= 800) {
    const json = await fetchJson(`https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&limit=${limit}&offset=${offset}&order[chapter]=desc`);
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
    await delay(120);
  }
  return map;
}

async function getMangaDexPages(chapterId) {
  const meta = await fetchJson(`https://api.mangadex.org/at-home/server/${chapterId}`);
  if (!meta?.baseUrl || !meta?.chapter?.data?.length) return null;
  return meta.chapter.data.map((file) => `${meta.baseUrl}/data/${meta.chapter.hash}/${file}`);
}

// MangaPill
async function searchMangaPill(title) {
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

async function runWorker() {
  const startTime = Date.now();
  const MAX_RUNTIME_MS = 12 * 60 * 1000;

  console.log(`[Worker ${WORKER_ID}/${TOTAL_WORKERS}] Running prioritized sync queue...`);

  const { data: queue } = await supabase
    .from('series')
    .select('id, title, english_title, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(40);

  if (!queue?.length) {
    console.log('No queued series.');
    process.exit(0);
  }

  const assigned = queue.filter((_, idx) => (idx % TOTAL_WORKERS) + 1 === WORKER_ID);
  console.log(`Processing ${assigned.length} priority titles.`);

  for (const s of assigned) {
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      console.log('12-minute safety limit reached. Exiting cleanly.');
      break;
    }

    await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);

    const mainTitle = s.english_title || s.title;
    console.log(`\n=> [${s.title}] Querying sources...`);

    const unifiedMap = new Map();
    const merge = (map) => {
      for (const [k, cands] of map.entries()) {
        if (!unifiedMap.has(k)) unifiedMap.set(k, []);
        unifiedMap.get(k).push(...cands);
      }
    };

    const [ckHid, mdId, mpSlug] = await Promise.all([
      searchComicK(mainTitle),
      searchMangaDex(mainTitle),
      searchMangaPill(mainTitle),
    ]);

    if (ckHid) merge(await getComicKChapters(ckHid));
    if (mdId) merge(await getMangaDexChapters(mdId));
    if (mpSlug) merge(await getMangaPillChapters(mpSlug));

    if (unifiedMap.size === 0) continue;

    const { data: existingChapters } = await supabase
      .from('chapters')
      .select('id, chapter_number, pages')
      .eq('series_id', s.id);

    const existingMap = new Map();
    for (const ex of existingChapters || []) {
      const key = toKey(cleanNum(ex.chapter_number));
      if (key) existingMap.set(key, ex);
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
          if (pages?.length > 0) break;
        } catch {}
      }

      if (!pages?.length) continue;

      let baseUrl = '';
      let compressedPages = pages;
      try {
        const urlObj = new URL(pages[0]);
        baseUrl = `${urlObj.protocol}//${urlObj.hostname}/`;
        compressedPages = pages.map((p) => (p.startsWith(baseUrl) ? p.replace(baseUrl, '') : p));
      } catch {}

      if (existing) {
        await supabase.from('chapters').update({ base_url: baseUrl, pages: compressedPages }).eq('id', existing.id);
        repairedCount++;
      } else {
        await supabase.from('chapters').insert({
          series_id: s.id,
          chapter_number: chNum,
          title: `Chapter ${chNum}`,
          base_url: baseUrl,
          pages: compressedPages,
        });
        addedCount++;
      }
      await delay(100);
    }

    console.log(`   + Added: ${addedCount} | Repaired: ${repairedCount}`);
  }

  console.log(`[Worker ${WORKER_ID}] Priority pass complete.`);
  process.exit(0);
}

runWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
