import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const WORKER_ID = parseInt(process.env.WORKER_ID || '1', 10);
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '1', 10);

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchJson(url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...HEADERS, ...(options.headers || {}) },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchHtml(url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...HEADERS, ...(options.headers || {}) },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function cleanNum(str) {
  if (!str) return null;
  const match = String(str).match(/[0-9]+(?:\.[0-9]+)?/);
  return match ? parseFloat(match[0]) : null;
}

function toKey(num) {
  if (num === null || isNaN(num)) return null;
  return Number.isInteger(num) ? String(num) : String(num);
}

function isNovel(text) {
  if (!text) return false;
  const l = text.toLowerCase();
  return (
    l.includes('[novel]') ||
    l.includes('(novel)') ||
    l.includes('webnovel') ||
    l.includes('light novel') ||
    l.includes('[ln]') ||
    l.includes('[wn]')
  );
}

// ---------------- PAGE SCRAPERS FOR RESOLVED INTEL ----------------
async function getHiveToonsPages(chapterUrl) {
  const html = await fetchHtml(chapterUrl);
  if (!html) return null;

  const matches = [...html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi)];
  const pages = matches
    .map((m) => m[1])
    .filter((url) => !url.includes('logo') && !url.includes('banner') && !url.includes('avatar'));
  return pages.length ? pages : null;
}

async function getAsuraPages(chapterUrl) {
  const html = await fetchHtml(chapterUrl);
  if (!html) return null;

  const matches = [...html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi)];
  const pages = matches
    .map((m) => m[1])
    .filter((url) => !url.includes('logo') && !url.includes('banner') && !url.includes('discord'));
  return pages.length ? pages : null;
}

async function getComicKPages(chapterHid) {
  const json = await fetchJson(`https://api.comick.io/chapter/${chapterHid}`);
  if (!json?.chapter?.images?.length) return null;
  return json.chapter.images
    .map((img) => img.url || (img.b2key ? `https://meo3.comick.pictures/${img.b2key}` : null))
    .filter(Boolean);
}

async function getMangaDexPages(chapterId) {
  const meta = await fetchJson(`https://api.mangadex.org/at-home/server/${chapterId}`);
  if (!meta?.baseUrl || !meta?.chapter?.data?.length) return null;
  return meta.chapter.data.map((file) => `${meta.baseUrl}/data/${meta.chapter.hash}/${file}`);
}

async function getMangaPillPages(chapterSlug) {
  const html = await fetchHtml(`https://mangapill.com/chapters/${chapterSlug}`);
  if (!html) return null;
  const matches = [...html.matchAll(/data-src="([^"]+)"/g)];
  return matches.length ? matches.map((m) => m[1]) : null;
}

// ---------------- BACKUP LIVE AGGREGATORS (IF NO INTEL) ----------------
async function searchComicK(title) {
  const cleanTitle = title.replace(/['’]/g, '').trim();
  const json = await fetchJson(
    `https://api.comick.io/v1.0/search?q=${encodeURIComponent(cleanTitle)}&limit=8&type=comic`
  );
  if (!Array.isArray(json) || json.length === 0) return [];

  const foundHids = [];
  for (const c of json) {
    if (c.comic_type === 'novel' || c.type === 'novel') continue;
    if (isNovel(c.title) || isNovel(c.slug)) continue;
    if (c.hid) foundHids.push(c.hid);
  }
  return foundHids;
}

async function getComicKChapters(hid) {
  const map = new Map();
  let page = 1;
  while (page <= 50) {
    const json = await fetchJson(
      `https://api.comick.io/comic/${hid}/chapters?lang=en&page=${page}&limit=100`
    );
    if (!json?.chapters?.length) break;

    for (const item of json.chapters) {
      if (isNovel(item.title) || isNovel(item.chap)) continue;

      const key = toKey(cleanNum(item.chap));
      if (key && item.hid) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ id: item.hid, type: 'comick', order: 3 });
      }
    }
    if (json.chapters.length < 100) break;
    page++;
    await delay(30);
  }
  return map;
}

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
  while (offset <= 2000) {
    const json = await fetchJson(
      `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&limit=${limit}&offset=${offset}&order[chapter]=desc`
    );
    if (!json?.data?.length) break;
    for (const item of json.data) {
      const key = toKey(cleanNum(item.attributes?.chapter));
      if (key && item.id) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ id: item.id, type: 'mangadex', order: 4 });
      }
    }
    if (json.data.length < limit) break;
    offset += limit;
    await delay(35);
  }
  return map;
}

async function searchMangaPill(title) {
  if (!/^[\x00-\x7F]+$/.test(title)) return null;

  const cleanTitle = title.replace(/['’]/g, '').trim();
  const html = await fetchHtml(`https://mangapill.com/search?q=${encodeURIComponent(cleanTitle)}`);
  if (!html) return null;

  const matches = [...html.matchAll(/href="\/manga\/([0-9]+\/([^"]+))"/gi)];
  if (!matches.length) return null;

  const targetSlug = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const exact = matches.find((m) => {
    const slug = m[2].toLowerCase();
    return slug.includes(targetSlug) || targetSlug.includes(slug);
  });

  return exact ? exact[1] : matches[0][1];
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
      map.get(key).push({ id: match[1], type: 'mangapill', order: 5 });
    }
  }
  return map;
}

// ---------------- UNIFIED INTEL-FIRST BUILDER ----------------
async function buildAggregatedChapterMap(s) {
  const unifiedMap = new Map();

  // 1. QUERY PRE-SCOUTED INTEL TABLE FIRST (HIGH SPEED / ZERO GUESSING)
  const { data: intelRows } = await supabase
    .from('series_intel')
    .select('*')
    .eq('series_id', s.id);

  if (intelRows && intelRows.length > 0) {
    console.log(`   [Intel Engine] Found ${intelRows.length} scouted platforms for ${s.title}`);
    for (const intel of intelRows) {
      const verifiedList = Array.isArray(intel.verified_chapters) ? intel.verified_chapters : [];
      for (const item of verifiedList) {
        const key = toKey(item.chNum);
        if (!key) continue;

        if (!unifiedMap.has(key)) unifiedMap.set(key, []);

        if (intel.source_platform === 'hivetoons') {
          unifiedMap.get(key).push({ id: item.url, type: 'hivetoons', order: 1 });
        } else if (intel.source_platform === 'asura') {
          unifiedMap.get(key).push({ id: item.url, type: 'asura', order: 2 });
        } else if (intel.source_platform === 'comick') {
          unifiedMap.get(key).push({ id: item.hid, type: 'comick', order: 3 });
        } else if (intel.source_platform === 'mangapill') {
          unifiedMap.get(key).push({ id: item.chapterSlug, type: 'mangapill', order: 4 });
        }
      }
    }
  }

  // If Intel provided extensive chapters, return early
  if (unifiedMap.size >= 50) {
    return cleanUnifiedMap(unifiedMap);
  }

  // 2. LIVE DISCOVERY FALLBACK
  const checkedHids = new Set();
  const checkedQueries = new Set();

  const merge = (map) => {
    for (const [k, cands] of map.entries()) {
      if (!unifiedMap.has(k)) unifiedMap.set(k, []);
      unifiedMap.get(k).push(...cands);
    }
  };

  const queries = [s.english_title, s.title, s.native_title];
  if (Array.isArray(s.synonyms)) queries.push(...s.synonyms);
  else if (typeof s.synonyms === 'string') {
    try {
      const p = JSON.parse(s.synonyms);
      if (Array.isArray(p)) queries.push(...p);
      else queries.push(s.synonyms);
    } catch {
      queries.push(...s.synonyms.split(/[,;\n]/));
    }
  }

  for (const q of queries) {
    const clean = (q || '').trim();
    if (clean.length < 2 || isNovel(clean) || checkedQueries.has(clean.toLowerCase())) continue;
    checkedQueries.add(clean.toLowerCase());

    const [comickHids, mdId, mpSlug] = await Promise.all([
      searchComicK(clean),
      searchMangaDex(clean),
      searchMangaPill(clean),
    ]);

    for (const hid of comickHids) {
      if (!checkedHids.has(hid)) {
        checkedHids.add(hid);
        merge(await getComicKChapters(hid));
      }
    }

    if (mdId) merge(await getMangaDexChapters(mdId));
    if (mpSlug) merge(await getMangaPillChapters(mpSlug));

    await delay(30);
  }

  return cleanUnifiedMap(unifiedMap);
}

function cleanUnifiedMap(map) {
  for (const [key, candidates] of map.entries()) {
    const seen = new Set();
    const unique = [];
    for (const c of candidates) {
      const uKey = `${c.type}:${c.id}`;
      if (!seen.has(uKey)) {
        seen.add(uKey);
        unique.push(c);
      }
    }
    unique.sort((a, b) => a.order - b.order);
    map.set(key, unique);
  }
  return map;
}

// ---------------- MAIN SYNC ROUTINE ----------------
async function syncSeries(s) {
  await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);

  console.log(`\n=> [Worker ${WORKER_ID}] [${s.title}] Processing chapters...`);
  const unifiedMap = await buildAggregatedChapterMap(s);

  if (unifiedMap.size === 0) {
    console.log('   No online graphic releases matched.');
    return;
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

    // Safeguard caps for completed manga with novel leaks
    if (s.slug === 'doctor-elise' && chNum > 145) continue;
    if (s.slug === 'a25e46ec-30f7-4db6-89df-cacbc1d9a900' && chNum > 140) continue; // Horimiya

    const existing = existingMap.get(k);
    const isCorrupted =
      existing &&
      (!existing.pages ||
        existing.pages.length === 0 ||
        (existing.pages[0] &&
          (existing.pages[0].includes('example.com') || existing.pages[0].includes('/mangap/2560/'))));

    if (!existing || isCorrupted) {
      tasks.push({
        chNum,
        candidates,
        existing: existing || null,
      });
    }
  }

  if (tasks.length === 0) {
    console.log(`   All ${existingChapters?.length || 0} chapters already intact.`);
    return;
  }

  console.log(`   Found ${unifiedMap.size} available chapters! Ingesting / Repairing ${tasks.length} missing chapters...`);

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
    for (const cand of task.candidates) {
      try {
        if (cand.type === 'hivetoons') pages = await getHiveToonsPages(cand.id);
        else if (cand.type === 'asura') pages = await getAsuraPages(cand.id);
        else if (cand.type === 'comick') pages = await getComicKPages(cand.id);
        else if (cand.type === 'mangadex') pages = await getMangaDexPages(cand.id);
        else if (cand.type === 'mangapill') pages = await getMangaPillPages(cand.id);

        if (Array.isArray(pages) && pages.length > 0) break;
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

  if (upsertBatch.length > 0) {
    for (let i = 0; i < upsertBatch.length; i += 100) {
      const chunk = upsertBatch.slice(i, i + 100);
      const { error: batchErr } = await supabase
        .from('chapters')
        .upsert(chunk, { onConflict: 'series_id,chapter_number' });

      if (batchErr) {
        console.error('Batch upsert warning:', batchErr.message);
      }
    }
  }

  console.log(`   + Added: ${addedCount} | Repaired: ${repairedCount}`);
}

async function main() {
  console.log(`=== MangaFlow Runner Worker ${WORKER_ID} of ${TOTAL_WORKERS} Started ===`);

  const { data: allSeries, error } = await supabase
    .from('series')
    .select('id, slug, title, english_title, native_title, synonyms')
    .order('updated_at', { ascending: true })
    .limit(100);

  if (error || !allSeries) {
    console.error('Failed to query series:', error?.message);
    process.exit(1);
  }

  const assignedSeries = allSeries.filter((_, idx) => idx % TOTAL_WORKERS === (WORKER_ID - 1));

  console.log(`Worker ${WORKER_ID} assigned ${assignedSeries.length} series to sync...`);
  for (const s of assignedSeries) {
    await syncSeries(s);
  }

  console.log(`=== Worker ${WORKER_ID} Sync Cycle Complete ===`);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
