// scripts/sync-multi-source.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_ID = parseInt(process.env.WORKER_ID || '1', 10);
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '5', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

async function safeFetchHtml(url, referer = 'https://www.google.com/') {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, 'Referer': referer },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function safeFetchJson(url, referer = 'https://www.google.com/') {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, 'Accept': 'application/json', 'Referer': referer },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// 1. HYBRID STORAGE ENCODER (Separates Root Base URL from Relative Page Paths)
function compressPageUrls(fullUrls) {
  if (!fullUrls || !fullUrls.length) return { baseUrl: null, relativePages: [] };

  const firstUrl = fullUrls[0];
  try {
    const parsed = new URL(firstUrl);
    const baseUrl = `${parsed.protocol}//${parsed.host}/`;

    const canCompress = fullUrls.every((u) => u.startsWith(baseUrl));
    if (canCompress) {
      const relativePages = fullUrls.map((u) => u.slice(baseUrl.length));
      return { baseUrl, relativePages };
    }
  } catch {}

  return { baseUrl: null, relativePages: fullUrls };
}

// 2. FOREIGN CONTAMINATION SHIELD (Blocks rogue single-series CDNs & title mismatches)
function isDisallowedCdn(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  const blockedCdns = [
    'readdetectiveconan',
    'onepiecechapters',
    'readsololeveling',
    'readjujutsukaisen',
    'example.com',
  ];
  return blockedCdns.some((domain) => lower.includes(domain));
}

// 3. SOURCE PAGE EXTRACTORS

// COMICK
async function fetchComicKPages(hid) {
  const json = await safeFetchJson(`https://api.comick.io/chapter/${hid}`, 'https://comick.io/');
  if (!json?.chapter?.images?.length) return [];
  return json.chapter.images
    .map((img) => (img.url ? (img.url.startsWith('http') ? img.url : `https://meo3.comick.pictures/${img.url}`) : null))
    .filter(Boolean);
}

// HIVETOONS
async function fetchHiveToonsPages(chapterUrl) {
  const html = await safeFetchHtml(chapterUrl, 'https://hivetoons.org/');
  if (!html) return [];
  const pages = [];
  const regex = /<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|avif)[^"']*)["'][^>]*>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const src = m[1];
    if (!src.includes('logo') && !src.includes('banner') && !src.includes('icon') && !isDisallowedCdn(src)) {
      pages.push(src);
    }
  }
  return pages;
}

// ARENASCANS
async function fetchArenaScansPages(chapterUrl) {
  const html = await safeFetchHtml(chapterUrl, 'https://arenascan.com/');
  if (!html) return [];
  const pages = [];
  const regex = /<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|avif)[^"']*)["'][^>]*>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const src = m[1];
    if (!src.includes('logo') && !src.includes('banner') && !src.includes('icon') && !isDisallowedCdn(src)) {
      pages.push(src);
    }
  }
  return pages;
}

// MANGABUDDY
async function fetchMangaBuddyPages(chapterUrl) {
  const html = await safeFetchHtml(chapterUrl, 'https://mangabuddy.com/');
  if (!html) return [];
  const pages = [];
  const regex = /<img[^>]+(?:data-)?src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|avif)[^"']*)["'][^>]*>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const src = m[1];
    if (!src.includes('logo') && !src.includes('banner') && !src.includes('icon') && !isDisallowedCdn(src)) {
      pages.push(src);
    }
  }
  return pages;
}

// ASURA
async function fetchAsuraPages(chapterUrl) {
  const html = await safeFetchHtml(chapterUrl, 'https://asuracomic.net/');
  if (!html) return [];
  const pages = [];
  const regex = /<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|avif)[^"']*)["'][^>]*>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const src = m[1];
    if (!src.includes('logo') && !src.includes('banner') && !isDisallowedCdn(src)) {
      pages.push(src);
    }
  }
  return pages;
}

// FLAME COMICS
async function fetchFlamePages(chapterUrl) {
  const html = await safeFetchHtml(chapterUrl, 'https://flamecomics.me/');
  if (!html) return [];
  const pages = [];
  const regex = /<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|avif)[^"']*)["'][^>]*>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const src = m[1];
    if (!src.includes('logo') && !src.includes('banner') && !isDisallowedCdn(src)) {
      pages.push(src);
    }
  }
  return pages;
}

// MANGADEX
async function fetchMangaDexPages(chapterId) {
  const atHome = await safeFetchJson(`https://api.mangadex.org/at-home/server/${chapterId}`, 'https://mangadex.org/');
  if (!atHome?.baseUrl || !atHome?.chapter?.data?.length) return [];
  const host = atHome.baseUrl;
  const hash = atHome.chapter.hash;
  return atHome.chapter.data.map((file) => `${host}/data/${hash}/${file}`);
}

// MANGANATO / MANGABAT
async function fetchMangaNatoPages(chapterUrl) {
  const html = await safeFetchHtml(chapterUrl, 'https://natomanga.com/');
  if (!html) return [];
  const pages = [];
  const regex = /<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|avif)[^"']*)["'][^>]*>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const src = m[1];
    if (!src.includes('logo') && !src.includes('banner') && !isDisallowedCdn(src)) {
      pages.push(src);
    }
  }
  return pages;
}

// MANGAPILL
async function fetchMangaPillPages(chapterSlug) {
  const url = `https://mangapill.com/chapters/${chapterSlug}`;
  const html = await safeFetchHtml(url, 'https://mangapill.com/');
  if (!html) return [];
  const pages = [];
  const regex = /<img[^>]+data-src=["'](https?:\/\/[^"']+)["']/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    if (!isDisallowedCdn(m[1])) {
      pages.push(m[1]);
    }
  }
  return pages;
}

// 4. MAIN INGESTION ROUTINE FOR A SINGLE CHAPTER
async function downloadAndSaveChapter(seriesId, chNum, chTitle, candidates) {
  const priority = ['hivetoons', 'arenascans', 'asura', 'flame', 'mangabuddy', 'comick', 'mangabat', 'mangadex', 'mangapill'];
  const sorted = [...candidates].sort((a, b) => priority.indexOf(a.platform) - priority.indexOf(b.platform));

  for (const src of sorted) {
    let rawPages = [];
    try {
      if (src.platform === 'hivetoons') rawPages = await fetchHiveToonsPages(src.url);
      else if (src.platform === 'arenascans') rawPages = await fetchArenaScansPages(src.url);
      else if (src.platform === 'mangabuddy') rawPages = await fetchMangaBuddyPages(src.url);
      else if (src.platform === 'asura') rawPages = await fetchAsuraPages(src.url);
      else if (src.platform === 'flame') rawPages = await fetchFlamePages(src.url);
      else if (src.platform === 'comick') rawPages = await fetchComicKPages(src.hid);
      else if (src.platform === 'mangadex') rawPages = await fetchMangaDexPages(src.id);
      else if (src.platform === 'mangabat') rawPages = await fetchMangaNatoPages(src.url);
      else if (src.platform === 'mangapill') rawPages = await fetchMangaPillPages(src.chapterSlug);
    } catch {}

    if (rawPages && rawPages.length >= 5) {
      const { baseUrl, relativePages } = compressPageUrls(rawPages);

      const { error } = await supabase.from('chapters').upsert(
        {
          series_id: seriesId,
          chapter_number: chNum,
          title: chTitle || `Chapter ${chNum}`,
          base_url: baseUrl,
          pages: relativePages,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'series_id,chapter_number' }
      );

      if (!error) {
        console.log(`    ✅ Saved Ch. ${chNum} via [${src.platform}] (${rawPages.length} panels, lean hybrid format)`);
        return true;
      }
    }
    await delay(50);
  }
  return false;
}

// 5. WORKER DISPATCHER
async function runWorker() {
  console.log(`=== MangaFlow Ingestion Worker ${WORKER_ID}/${TOTAL_WORKERS} Online ===`);

  const { data: intelList, error } = await supabase
    .from('series_intel')
    .select('series_id, source_platform, verified_chapters')
    .order('last_scouted_at', { ascending: false });

  if (error || !intelList?.length) {
    console.log('No series intel found to ingest.');
    return;
  }

  const seriesMap = new Map();
  for (const row of intelList) {
    if (!seriesMap.has(row.series_id)) seriesMap.set(row.series_id, []);
    seriesMap.get(row.series_id).push(row);
  }

  const allSeriesIds = Array.from(seriesMap.keys());
  const workerSeriesIds = allSeriesIds.filter((_, idx) => idx % TOTAL_WORKERS === WORKER_ID - 1);

  console.log(`Worker ${WORKER_ID} assigned ${workerSeriesIds.length} series to ingest.`);

  for (const seriesId of workerSeriesIds) {
    const { data: series } = await supabase.from('series').select('id, title, slug').eq('id', seriesId).single();
    if (!series) continue;

    const { data: existingChapters } = await supabase
      .from('chapters')
      .select('chapter_number')
      .eq('series_id', seriesId);

    const existingSet = new Set((existingChapters || []).map((c) => Number(c.chapter_number)));

    const chapterCandidates = new Map();
    const sourceRows = seriesMap.get(seriesId) || [];

    for (const sRow of sourceRows) {
      for (const ch of sRow.verified_chapters || []) {
        const num = Number(ch.chNum);
        if (!chapterCandidates.has(num)) chapterCandidates.set(num, []);
        chapterCandidates.get(num).push({ ...ch, platform: sRow.source_platform });
      }
    }

    const missingNums = Array.from(chapterCandidates.keys())
      .filter((n) => !existingSet.has(n))
      .sort((a, b) => b - a);

    if (missingNums.length === 0) continue;

    console.log(`\n📥 "${series.title}": Ingesting ${missingNums.length} missing chapters.`);

    const batch = missingNums.slice(0, 40);
    for (const chNum of batch) {
      const candidates = chapterCandidates.get(chNum) || [];
      await downloadAndSaveChapter(seriesId, chNum, candidates[0]?.title, candidates);
      await delay(100);
    }
  }

  console.log(`\n🎉 Worker ${WORKER_ID} ingestion cycle complete.`);
}

runWorker().catch(console.error);
