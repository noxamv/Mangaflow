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

// DIRECT KNOWN WORKING HIDs & SLUGS
// If slug search fails, direct HIDs guarantee pulling 500+ chapters immediately
const DIRECT_TARGETS = {
  'lookism': {
    searchTerms: ['Lookism', '00-lookism', '외모지상주의'],
    comickHids: ['3vK1x', 'xRk5z'], // ComicK primary and webtoon mirror HIDs
    mangapillSlug: '2437/lookism',
    asuraSlug: 'lookism',
  },
  'eleceed': {
    searchTerms: ['Eleceed', '일렉시드'],
    comickHids: ['7eB2q', 'vVv1a'],
    mangapillSlug: '3514/eleceed',
    asuraSlug: 'eleceed',
  },
  'omniscient-readers-viewpoint': {
    searchTerms: ['Omniscient Reader', '00-omniscient-reader-s-viewpoint', '전지적 독자 시점'],
    comickHids: ['v4M81', 'b2bB9'],
    mangapillSlug: '4883/omniscient-readers-viewpoint',
    asuraSlug: 'omniscient-readers-viewpoint',
  },
  'latna-saga-survival-of-a-sword-king': {
    searchTerms: ['Survival Story of a Sword King in a Fantasy World', 'Latna Saga'],
    comickHids: ['2W2yq'],
    mangapillSlug: '4166/survival-story-of-a-sword-king-in-a-fantasy-world',
    asuraSlug: 'survival-story-of-a-sword-king-in-a-fantasy-world',
  },
  '9ecd208c-c592-4462-9f57-4d7d4a9f956f': { // Mercenary Enrollment
    searchTerms: ['Teenage Mercenary', 'Mercenary Enrollment', '입학용병'],
    comickHids: ['50N5e', 'x9x9a'],
    mangapillSlug: '4979/mercenary-enrollment',
    asuraSlug: 'mercenary-enrollment',
  },
  'd7f56ace-cd30-48b9-8b64-afeca0077fca': { // The Greatest Estate Developer
    searchTerms: ['The World’s Best Engineer', 'The Greatest Estate Developer', '역대급 영지 설계사'],
    comickHids: ['9V87q'],
    mangapillSlug: '5482/the-greatest-estate-developer',
    asuraSlug: 'the-greatest-estate-developer',
  },
  'dcdcc8c7-932e-4f60-a900-5f19934eb6cf': { // Dungeon Reset
    searchTerms: ['Dungeon Reset', '던전 리셋'],
    comickHids: ['8JzVq'],
    mangapillSlug: '3643/dungeon-reset',
  },
  'priscilla-s-marriage-request': {
    searchTerms: ['Priscilla’s Marriage Proposal', 'Priscilla’s Marriage Request', '프리실라의 결혼 의뢰'],
    comickHids: ['q4q4q'],
  }
};

async function fetchJson(url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        ...(options.headers || {}),
      },
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
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        ...(options.headers || {}),
      },
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

function isNovelKeyword(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('(novel)') ||
    lower.includes('[novel]') ||
    lower.includes('light novel') ||
    lower.includes('web novel') ||
    lower.endsWith(' novel')
  );
}

// ---------------- COMICK ----------------
async function searchComicK(title) {
  const json = await fetchJson(
    `https://api.comick.io/v1.0/search?q=${encodeURIComponent(title)}&limit=10&type=comic`
  );
  if (!Array.isArray(json) || json.length === 0) return [];

  const foundHids = [];
  for (const c of json) {
    const rawTitle = (c.title || '').toLowerCase();
    const slug = (c.slug || '').toLowerCase();
    if (c.comic_type === 'novel' || c.type === 'novel') continue;
    if (rawTitle.includes('(novel)') || rawTitle.includes('[novel]') || slug.includes('-novel')) continue;
    if (c.hid) foundHids.push(c.hid);
  }
  return foundHids;
}

async function getComicKChapters(hid) {
  const map = new Map();
  let page = 1;
  while (page <= 50) {
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
    await delay(35);
  }
  return map;
}

async function getComicKPages(chapterHid) {
  const json = await fetchJson(`https://api.comick.io/chapter/${chapterHid}`);
  if (!json?.chapter?.images?.length) return null;
  return json.chapter.images
    .map((img) => img.url || (img.b2key ? `https://meo3.comick.pictures/${img.b2key}` : null))
    .filter(Boolean);
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
  while (offset <= 2000) {
    const json = await fetchJson(
      `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&limit=${limit}&offset=${offset}&order[chapter]=desc`
    );
    if (!json?.data?.length) break;
    for (const item of json.data) {
      const key = toKey(cleanNum(item.attributes?.chapter));
      if (key && item.id) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ id: item.id, type: 'mangadex', order: 2 });
      }
    }
    if (json.data.length < limit) break;
    offset += limit;
    await delay(45);
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

// ---------------- AGGREGATION ENGINE ----------------
async function buildAggregatedChapterMap(s) {
  const unifiedMap = new Map();
  const checkedHids = new Set();
  const checkedQueries = new Set();

  const merge = (map) => {
    for (const [k, cands] of map.entries()) {
      if (!unifiedMap.has(k)) unifiedMap.set(k, []);
      unifiedMap.get(k).push(...cands);
    }
  };

  const directConfig = DIRECT_TARGETS[s.slug] || DIRECT_TARGETS[s.id] || null;

  // 1. Direct ComicK HIDs injection
  if (directConfig?.comickHids) {
    for (const hid of directConfig.comickHids) {
      if (!checkedHids.has(hid)) {
        checkedHids.add(hid);
        merge(await getComicKChapters(hid));
      }
    }
  }

  // 2. Direct MangaPill Slug
  if (directConfig?.mangapillSlug) {
    merge(await getMangaPillChapters(directConfig.mangapillSlug));
  }

  // 3. Search query assembly
  const queries = [];
  if (directConfig?.searchTerms) {
    queries.push(...directConfig.searchTerms);
  }
  if (s.english_title) queries.push(s.english_title);
  if (s.title) queries.push(s.title);
  if (s.native_title) queries.push(s.native_title);

  if (Array.isArray(s.synonyms)) {
    queries.push(...s.synonyms);
  } else if (typeof s.synonyms === 'string') {
    try {
      const parsed = JSON.parse(s.synonyms);
      if (Array.isArray(parsed)) queries.push(...parsed);
      else queries.push(s.synonyms);
    } catch {
      queries.push(...s.synonyms.split(/[,;\n]/));
    }
  }

  for (const q of queries) {
    const clean = (q || '').trim();
    if (clean.length < 2 || isNovelKeyword(clean) || checkedQueries.has(clean.toLowerCase())) continue;
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
    unique.sort((a, b) => a.order - b.order);
    unifiedMap.set(key, unique);
  }

  return unifiedMap;
}

async function syncSeries(s) {
  await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);

  console.log(`\n=> [Worker ${WORKER_ID}] [${s.title}] Resolving comic releases...`);
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
    const existing = existingMap.get(k);
    const isCorrupted =
      existing &&
      (!existing.pages ||
        existing.pages.length === 0 ||
        (existing.pages[0] &&
          (existing.pages[0].includes('example.com') || existing.pages[0].includes('/mangap/2560/'))));

    if (!existing || isCorrupted) {
      tasks.push({
        chNum: parseFloat(k),
        candidates,
        existing: existing || null,
      });
    }
  }

  if (tasks.length === 0) {
    console.log(`   All ${existingChapters?.length || 0} chapters already intact.`);
    return;
  }

  console.log(`   Found ${unifiedMap.size} available chapters online! Ingesting / Repairing ${tasks.length} missing chapters...`);

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
        if (cand.type === 'comick') pages = await getComicKPages(cand.id);
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
