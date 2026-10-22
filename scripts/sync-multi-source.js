import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_ID = parseInt(process.env.WORKER_ID || '1', 10);
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '5', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Fatal Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: null },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        if (res.status === 429) {
          await delay(2000 * (i + 1));
          continue;
        }
        return null;
      }
      return await res.json();
    } catch {
      await delay(1000);
    }
  }
  return null;
}

async function fetchHtml(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return await res.text();
      if (res.status === 429) await delay(2000 * (i + 1));
    } catch {
      await delay(1000);
    }
  }
  return null;
}

const cleanNum = (val) => {
  if (!val) return 0;
  const match = String(val).match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
};

const toKey = (num) => {
  return parseFloat(num).toFixed(4); 
};

// ==========================================
// SOURCE 1: COMICK
// ==========================================
async function searchComicK(title) {
  const url = `https://api.comick.io/v1.0/search?q=${encodeURIComponent(title)}&limit=1&type=comic`;
  const json = await fetchJson(url);
  if (json && json.length > 0) return json[0].hid;
  return null;
}

async function getComicKChapters(comicHid) {
  let chapters = [];
  let page = 1;
  while (true) {
    const url = `https://api.comick.io/comic/${comicHid}/chapters?lang=en&page=${page}&limit=100`;
    const json = await fetchJson(url);
    if (!json || !json.chapters || json.chapters.length === 0) break;
    
    for (const c of json.chapters) {
      if (!c.chap) continue;
      chapters.push({
        chapter_number: cleanNum(c.chap),
        title: c.title || `Chapter ${c.chap}`,
        id: c.hid,
        type: 'comick',
      });
    }
    if (json.chapters.length < 100) break;
    page++;
    await delay(300);
  }
  return chapters;
}

async function getComicKPages(chapterHid) {
  const json = await fetchJson(`https://api.comick.io/chapter/${chapterHid}`);
  if (!json || !json.chapter || !json.chapter.images) return [];
  return json.chapter.images
    .filter((img) => img.url)
    .map((img) => (img.url.startsWith('http') ? img.url : `https://meo3.comick.pictures/${img.url}`));
}

// ==========================================
// SOURCE 2: MANGADEX
// ==========================================
async function searchMangaDex(title) {
  const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(
    title
  )}&limit=1&includes[]=cover_art&order[relevance]=desc`;
  const json = await fetchJson(url);
  if (json && json.data && json.data.length > 0) return json.data[0].id;
  return null;
}

async function getMangaDexChapters(mangaId) {
  let chapters = [];
  let offset = 0;
  let limit = 100;

  while (true) {
    const url = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&limit=${limit}&offset=${offset}&order[chapter]=desc`;
    const json = await fetchJson(url);
    if (!json || !json.data || json.data.length === 0) break;

    for (const item of json.data) {
      const attrs = item.attributes;
      if (!attrs.chapter) continue;
      
      chapters.push({
        chapter_number: cleanNum(attrs.chapter),
        title: attrs.title || `Chapter ${attrs.chapter}`,
        id: item.id,
        type: 'mangadex',
      });
    }

    offset += limit;
    if (offset >= json.total) break;
    await delay(300);
  }
  return chapters;
}

async function getMangaDexPages(chapterId) {
  const meta = await fetchJson(`https://api.mangadex.org/at-home/server/${chapterId}`);
  if (!meta || !meta.baseUrl || !meta.chapter || !meta.chapter.data) return [];
  const host = meta.baseUrl;
  const hash = meta.chapter.hash;
  return meta.chapter.data.map((file) => `${host}/data/${hash}/${file}`);
}

// ==========================================
// SOURCE 3: MANGAPILL
// ==========================================
async function searchMangaPill(title) {
  const url = `https://mangapill.com/search?q=${encodeURIComponent(title)}`;
  const html = await fetchHtml(url);
  if (!html) return null;
  const match = html.match(/href="\/manga\/([^"]+)"/);
  return match ? match[1] : null;
}

async function getMangaPillChapters(mangaSlug) {
  const url = `https://mangapill.com/manga/${mangaSlug}`;
  const html = await fetchHtml(url);
  if (!html) return [];

  const chapters = [];
  const regex = /href="\/chapters\/([^"]+)"[^>]*>Chapter ([\d.]+)/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    chapters.push({
      chapter_number: cleanNum(match[2]),
      title: `Chapter ${match[2]}`,
      id: match[1],
      type: 'mangapill',
    });
  }
  return chapters;
}

async function getMangaPillPages(chapterSlug) {
  const html = await fetchHtml(`https://mangapill.com/chapters/${chapterSlug}`);
  if (!html) return [];
  
  const pages = [];
  const regex = /<picture[^>]*><img[^>]*data-src="([^"]+)"/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    pages.push(match[1]);
  }
  return pages;
}

// ==========================================
// MAIN SYNC LOGIC
// ==========================================
async function run() {
  console.log(`[Worker ${WORKER_ID}/${TOTAL_WORKERS}] Starting fast matrix sync...`);

  let { data: seriesList, error } = await supabase
    .from('series')
    .select('id, title, english_title');

  if (error || !seriesList) {
    console.error('Failed to load series from Supabase', error);
    process.exit(1);
  }

  seriesList = seriesList.filter((_, i) => (i % TOTAL_WORKERS) + 1 === WORKER_ID);
  console.log(`Worker assigned ${seriesList.length} series.`);

  for (const s of seriesList) {
    const mainTitle = s.english_title || s.title;
    console.log(`\n=> [${s.title}] Processing...`);

    const { data: existingData } = await supabase
      .from('chapters')
      .select('id, chapter_number, pages')
      .eq('series_id', s.id);

    const existingMap = new Map();
    if (existingData) {
      existingData.forEach((ex) => {
        const key = toKey(cleanNum(ex.chapter_number));
        existingMap.set(key, ex);
      });
    }

    const sourceCandidates = new Map();

    const addCandidates = (list) => {
      list.forEach((ch) => {
        const key = toKey(ch.chapter_number);
        if (!sourceCandidates.has(key)) sourceCandidates.set(key, []);
        sourceCandidates.get(key).push(ch);
      });
    };

    // Parallel search across sources
    console.log(`   Searching sources...`);
    const [ckHid, mdId, mpSlug] = await Promise.allSettled([
      searchComicK(mainTitle),
      searchMangaDex(mainTitle),
      searchMangaPill(mainTitle),
    ]);

    const tasks = [];
    if (ckHid.status === 'fulfilled' && ckHid.value) tasks.push(getComicKChapters(ckHid.value));
    if (mdId.status === 'fulfilled' && mdId.value) tasks.push(getMangaDexChapters(mdId.value));
    if (mpSlug.status === 'fulfilled' && mpSlug.value) tasks.push(getMangaPillChapters(mpSlug.value));

    const results = await Promise.allSettled(tasks);
    results.forEach((r) => {
      if (r.status === 'fulfilled') addCandidates(r.value);
    });

    const chapterNums = Array.from(sourceCandidates.keys()).sort((a, b) => parseFloat(a) - parseFloat(b));
    let addedCount = 0;
    let repairedCount = 0;

    for (const key of chapterNums) {
      const chNum = parseFloat(key);
      const candidates = sourceCandidates.get(key);
      const existing = existingMap.get(key);

      if (existing && existing.pages && existing.pages.length > 0) {
        continue;
      }

      let pages = [];
      for (const cand of candidates) {
        try {
          if (cand.type === 'comick') pages = await getComicKPages(cand.id);
          else if (cand.type === 'mangadex') pages = await getMangaDexPages(cand.id);
          else if (cand.type === 'mangapill') pages = await getMangaPillPages(cand.id);
          if (pages && pages.length > 0) break;
        } catch {}
      }

      if (!pages || pages.length === 0) continue;

      // METHOD A: COMPRESS URLs TO SAVE 70% STORAGE
      let baseUrl = '';
      let compressedPages = pages;
      if (pages.length > 0) {
        try {
          const urlObj = new URL(pages[0]);
          baseUrl = `${urlObj.protocol}//${urlObj.hostname}/`;
          compressedPages = pages.map((p) => p.startsWith(baseUrl) ? p.replace(baseUrl, '') : p);
        } catch {}
      }

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

      await delay(120);
    }

    console.log(`   + Added: ${addedCount} | Repaired: ${repairedCount} empty chapters.`);
  }

  console.log(`\n[Worker ${WORKER_ID}] Finished.`);
  process.exit(0);
}

run();
