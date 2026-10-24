// scripts/sync-multi-source.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const WORKER_ID = parseInt(process.env.WORKER_ID || '1', 10);
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '1', 10);

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Referer': 'https://comick.io/',
};

async function fetchJson(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timeout);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function fetchHtml(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timeout);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

function toKey(num) {
  if (num === null || isNaN(num)) return null;
  return Number.isInteger(num) ? String(num) : String(num);
}

// --- PROVIDER PAGE PARSERS ---
async function getHivePages(url) {
  const html = await fetchHtml(url);
  if (!html) return null;
  const matches = [...html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi)];
  return matches.map((m) => m[1]).filter((u) => !u.includes('logo') && !u.includes('banner'));
}

async function getAsuraPages(url) {
  const html = await fetchHtml(url);
  if (!html) return null;
  const matches = [...html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi)];
  return matches.map((m) => m[1]).filter((u) => !u.includes('logo') && !u.includes('banner'));
}

async function getFlamePages(url) {
  const html = await fetchHtml(url);
  if (!html) return null;
  const matches = [...html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi)];
  return matches.map((m) => m[1]).filter((u) => !u.includes('logo') && !u.includes('banner'));
}

async function getComicKPages(hid) {
  const json = await fetchJson(`https://api.comick.io/chapter/${hid}`);
  if (!json?.chapter?.images?.length) return null;
  return json.chapter.images
    .map((img) => img.url || (img.b2key ? `https://meo3.comick.pictures/${img.b2key}` : null))
    .filter(Boolean);
}

async function getMangaDexPages(chapterId) {
  const meta = await fetchJson(`https://api.mangadex.org/at-home/server/${chapterId}`);
  if (!meta?.baseUrl || !meta?.chapter?.data?.length) return null;
  return meta.chapter.data.map((f) => `${meta.baseUrl}/data/${meta.chapter.hash}/${f}`);
}

async function getMangaPillPages(slug) {
  const html = await fetchHtml(`https://mangapill.com/chapters/${slug}`);
  if (!html) return null;
  const matches = [...html.matchAll(/data-src="([^"]+)"/g)];
  return matches.length ? matches.map((m) => m[1]) : null;
}

async function getMangaBatPages(url) {
  const html = await fetchHtml(url);
  if (!html) return null;
  const matches = [...html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi)];
  return matches.map((m) => m[1]).filter((u) => !u.includes('banner') && !u.includes('logo'));
}

// --- SYNC EXECUTOR ---
async function syncSeries(s) {
  const { data: intelRows } = await supabase
    .from('series_intel')
    .select('*')
    .eq('series_id', s.id)
    .order('latest_known_chapter', { ascending: false });

  if (!intelRows || intelRows.length === 0) return;

  const unifiedMap = new Map();

  for (const intel of intelRows) {
    for (const item of intel.verified_chapters || []) {
      const key = toKey(item.chNum);
      if (!key) continue;

      if (!unifiedMap.has(key)) unifiedMap.set(key, []);

      if (intel.source_platform === 'hivetoons') {
        unifiedMap.get(key).push({ id: item.url, type: 'hivetoons', priority: 1, title: item.title });
      } else if (intel.source_platform === 'asura') {
        unifiedMap.get(key).push({ id: item.url, type: 'asura', priority: 2, title: item.title });
      } else if (intel.source_platform === 'flame') {
        unifiedMap.get(key).push({ id: item.url, type: 'flame', priority: 3, title: item.title });
      } else if (intel.source_platform === 'mangadex') {
        unifiedMap.get(key).push({ id: item.id, type: 'mangadex', priority: 4, title: item.title });
      } else if (intel.source_platform === 'comick') {
        unifiedMap.get(key).push({ id: item.hid, type: 'comick', priority: 5, title: item.title });
      } else if (intel.source_platform === 'mangabat') {
        unifiedMap.get(key).push({ id: item.url, type: 'mangabat', priority: 6, title: null });
      } else if (intel.source_platform === 'mangapill') {
        unifiedMap.get(key).push({ id: item.chapterSlug, type: 'mangapill', priority: 7, title: null });
      }
    }
  }

  for (const [, candidates] of unifiedMap.entries()) {
    candidates.sort((a, b) => a.priority - b.priority);
  }

  const { data: existingChapters } = await supabase
    .from('chapters')
    .select('id, chapter_number, pages')
    .eq('series_id', s.id);

  const existingMap = new Map();
  for (const ec of existingChapters || []) {
    const k = toKey(ec.chapter_number);
    if (k) existingMap.set(k, ec);
  }

  const tasks = [];
  for (const [k, candidates] of unifiedMap.entries()) {
    const chNum = parseFloat(k);

    // Filter novel spills
    if (s.slug === 'doctor-elise' && chNum > 145) continue;
    if (s.slug === 'a25e46ec-30f7-4db6-89df-cacbc1d9a900' && chNum > 140) continue;

    const existing = existingMap.get(k);
    const isCorrupted =
      existing &&
      (!existing.pages ||
        existing.pages.length === 0 ||
        (existing.pages[0] && existing.pages[0].includes('example.com')));

    // Enqueue missing gap chapters or corrupted entries
    if (!existing || isCorrupted) {
      tasks.push({ chNum, candidates, existing: existing || null });
    }
  }

  if (tasks.length === 0) return;

  console.log(`\n=> [Worker ${WORKER_ID}] [${s.title}] Processing ${tasks.length} missing chapters...`);

  let addedCount = 0;
  let repairedCount = 0;
  const upsertBatch = [];

  const runWithConcurrency = async (items, concurrency, fn) => {
    let index = 0;
    const workers = new Array(concurrency).fill(null).map(async () => {
      while (index < items.length) {
        const cur = items[index++];
        await fn(cur);
      }
    });
    await Promise.all(workers);
  };

  await runWithConcurrency(tasks, 3, async (task) => {
    let pages = null;
    let chapterTitle = null;

    for (const cand of task.candidates) {
      try {
        if (cand.type === 'hivetoons') pages = await getHivePages(cand.id);
        else if (cand.type === 'asura') pages = await getAsuraPages(cand.id);
        else if (cand.type === 'flame') pages = await getFlamePages(cand.id);
        else if (cand.type === 'mangadex') pages = await getMangaDexPages(cand.id);
        else if (cand.type === 'comick') pages = await getComicKPages(cand.id);
        else if (cand.type === 'mangabat') pages = await getMangaBatPages(cand.id);
        else if (cand.type === 'mangapill') pages = await getMangaPillPages(cand.id);

        if (Array.isArray(pages) && pages.length > 0) {
          chapterTitle = cand.title;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!Array.isArray(pages) || pages.length === 0) return;

    let baseUrl = '';
    let compressedPages = pages;
    try {
      const urlObj = new URL(pages[0]);
      baseUrl = `${urlObj.protocol}//${urlObj.hostname}/`;
      compressedPages = pages.map((p) => (p.startsWith(baseUrl) ? p.replace(baseUrl, '') : p));
    } catch {}

    const cleanTitle = chapterTitle || `Chapter ${task.chNum}`;

    if (task.existing) {
      await supabase
        .from('chapters')
        .update({ base_url: baseUrl, pages: compressedPages, title: cleanTitle })
        .eq('id', task.existing.id);
      repairedCount++;
    } else {
      upsertBatch.push({
        series_id: s.id,
        chapter_number: task.chNum,
        title: cleanTitle,
        base_url: baseUrl,
        pages: compressedPages,
      });
      addedCount++;
    }
  });

  if (upsertBatch.length > 0) {
    for (let i = 0; i < upsertBatch.length; i += 50) {
      const chunk = upsertBatch.slice(i, i + 50);
      await supabase.from('chapters').upsert(chunk, { onConflict: 'series_id,chapter_number' });
    }
  }

  console.log(`   + [${s.title}] Added: ${addedCount} | Repaired: ${repairedCount}`);
}

async function main() {
  console.log(`=== MangaFlow Ingestion Worker ${WORKER_ID} of ${TOTAL_WORKERS} Initialized ===`);

  // Pull series with scouted intel available, prioritizing titles with the highest missing gaps
  const { data: prioritizedSeries, error } = await supabase
    .from('series')
    .select('id, title, slug')
    .order('updated_at', { ascending: false });

  if (error || !prioritizedSeries) {
    console.error('Failed to query series:', error);
    process.exit(1);
  }

  const mySeries = prioritizedSeries.filter((_, idx) => idx % TOTAL_WORKERS === WORKER_ID - 1);

  for (const s of mySeries) {
    try {
      await syncSeries(s);
    } catch (err) {
      console.warn(`Worker ${WORKER_ID} error syncing ${s.title}:`, err.message);
    }
  }

  console.log(`=== Worker ${WORKER_ID} Cycle Complete ===`);
}

main().catch(console.error);
