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
  if (num == null) return null;
  return Number.isInteger(num) ? String(num) : String(parseFloat(num.toFixed(2)));
}

function cleanTitle(str) {
  if (!str) return '';
  return str
    .replace(/[【】\[\]\(\)\{\}★☆～~:!?:_]/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSearchCandidates(series) {
  const candidates = [];
  const add = (txt) => {
    if (!txt) return;
    const clean = cleanTitle(txt);
    if (clean.length > 1 && !candidates.includes(clean)) candidates.push(clean);
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

async function searchComicK(query) {
  const data = await fetchJson(`https://api.comick.io/v1.0/search?q=${encodeURIComponent(query)}&limit=1`);
  return data?.[0] || null;
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
  const mdId = isMdUuid(series.source_url) ? series.source_url : isMdUuid(series.slug) ? series.slug : null;

  if (mdId) {
    const mdMap = await getMangaDexMap(mdId);
    mergeMap(mdMap);
  }

  for (const q of queries) {
    const meta = await searchComicK(q);
    if (meta?.hid) {
      if (!series.english_title && meta.title) {
        const synList = Array.isArray(meta.md_titles) ? meta.md_titles.map((t) => t.title) : [];
        await supabase
          .from('series')
          .update({
            english_title: meta.title,
            synonyms: synList.length > 0 ? synList : series.synonyms,
          })
          .eq('id', series.id);
      }

      const ckMap = await getComicKMap(meta.hid);
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

async function runWorker() {
  console.log(`[Worker ${WORKER_ID}/${TOTAL_WORKERS}] Multi-Source Ingestion Initialized.`);

  const { data: allSeries } = await supabase
    .from('series')
    .select('id, title, slug, source_url, english_title, native_title, synonyms, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(150);

  if (!allSeries?.length) return;

  const assigned = allSeries.filter((_, idx) => idx % TOTAL_WORKERS === WORKER_ID - 1);
  console.log(`[Worker ${WORKER_ID}] Assigned ${assigned.length} candidate series.`);

  for (const s of assigned) {
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

      await delay(200);
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
