// scripts/scout-intel.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

function cleanNum(str) {
  if (!str) return null;
  const match = String(str).match(/[0-9]+(?:\.[0-9]+)?/);
  return match ? parseFloat(match[0]) : null;
}

function toSlug(text) {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

// ---------------- 1. HIVE TOONS (LOOKISM 630+, ELECEED, ETC.) ----------------
async function scoutHiveToons(title) {
  const slug = toSlug(title);
  const html = await fetchHtml(`https://hivetoons.org/series/${slug}`);
  if (!html) return null;

  const chapters = [];
  const regex = /href=["'](https?:\/\/hivetoons\.org\/series\/[^"']*?chapter-([0-9]+(?:\.[0-9]+)?)[^"']*?)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const num = cleanNum(match[2]);
    if (num !== null) chapters.push({ chNum: num, url: match[1] });
  }
  return chapters.length ? { slug, chapters } : null;
}

// ---------------- 2. ASURA SCANS (TOP MANHWA RELEASES) ----------------
async function scoutAsura(title) {
  const slug = toSlug(title);
  const html = await fetchHtml(`https://asuracomic.net/series/${slug}`);
  if (!html) return null;

  const chapters = [];
  const regex = /href=["'](https?:\/\/[^"']*?chapter\/([0-9]+(?:\.[0-9]+)?)[^"']*?)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const num = cleanNum(match[2]);
    if (num !== null) chapters.push({ chNum: num, url: match[1] });
  }
  return chapters.length ? { slug, chapters } : null;
}

// ---------------- 3. FLAME COMICS (MURIM & SHONEN ARCHIVES) ----------------
async function scoutFlame(title) {
  const slug = toSlug(title);
  const html = await fetchHtml(`https://flamecomics.xyz/series/${slug}`);
  if (!html) return null;

  const chapters = [];
  const regex = /href=["'](https?:\/\/[^"']*?chapter\/([0-9]+(?:\.[0-9]+)?)[^"']*?)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const num = cleanNum(match[2]);
    if (num !== null) chapters.push({ chNum: num, url: match[1] });
  }
  return chapters.length ? { slug, chapters } : null;
}

// ---------------- 4. MANGADEX (MEMORIZE 1-100, COMPLETED TITLES) ----------------
async function scoutMangaDex(title) {
  const json = await fetchJson(
    `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=5&order[relevance]=desc`
  );
  if (!json?.data?.length) return null;

  const valid = json.data.find((m) => {
    const en = (m.attributes?.title?.en || Object.values(m.attributes?.title || {})[0] || '').toLowerCase();
    return !en.includes('(novel)') && !en.includes('[novel]');
  });

  const mangaId = valid?.id || json.data[0]?.id;
  if (!mangaId) return null;

  const chapters = [];
  let offset = 0;
  while (offset <= 2000) {
    const feed = await fetchJson(
      `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&limit=100&offset=${offset}&order[chapter]=desc`
    );
    if (!feed?.data?.length) break;

    for (const item of feed.data) {
      const num = cleanNum(item.attributes?.chapter);
      if (num !== null && item.id) {
        chapters.push({ chNum: num, id: item.id });
      }
    }
    if (feed.data.length < 100) break;
    offset += 100;
    await delay(35);
  }

  return chapters.length ? { mangaId, chapters } : null;
}

// ---------------- 5. COMICK (MULTI-SCANLATION AGGREGATOR) ----------------
async function scoutComicK(title) {
  const clean = title.replace(/['’]/g, '').trim().toLowerCase();
  const search = await fetchJson(`https://api.comick.io/v1.0/search?q=${encodeURIComponent(clean)}&limit=8&type=comic`);
  if (!Array.isArray(search) || !search.length) return null;

  const comic = search.find((c) => c.comic_type !== 'novel' && !isNovel(c.title) && !c.slug?.includes('novel'));
  const hid = comic?.hid || search[0]?.hid;
  if (!hid) return null;

  const chapters = [];
  let page = 1;
  while (page <= 35) {
    const json = await fetchJson(`https://api.comick.io/comic/${hid}/chapters?lang=en&page=${page}&limit=100`);
    if (!json?.chapters?.length) break;

    for (const c of json.chapters) {
      if (isNovel(c.title)) continue;
      const num = cleanNum(c.chap);
      if (num !== null && c.hid) {
        chapters.push({ chNum: num, hid: c.hid });
      }
    }
    if (json.chapters.length < 100) break;
    page++;
    await delay(30);
  }

  return chapters.length ? { hid, slug: comic?.slug || clean, chapters } : null;
}

// ---------------- 6. MANGAPILL (FAST LIGHTWEIGHT MIRROR) ----------------
async function scoutMangaPill(title) {
  const cleanTitle = title.replace(/['’]/g, '').trim();
  const html = await fetchHtml(`https://mangapill.com/search?q=${encodeURIComponent(cleanTitle)}`);
  if (!html) return null;

  const match = html.match(/href="\/manga\/([0-9]+\/([^"]+))"/i);
  if (!match) return null;

  const slug = match[1];
  const pageHtml = await fetchHtml(`https://mangapill.com/manga/${slug}`);
  if (!pageHtml) return null;

  const chapters = [];
  const chRegex = /href="\/chapters\/([^"]+)"[^>]*>.*?chapter\s*([0-9]+(?:\.[0-9]+)?)/gi;
  let m;
  while ((m = chRegex.exec(pageHtml)) !== null) {
    const num = cleanNum(m[2]);
    if (num !== null) chapters.push({ chNum: num, chapterSlug: m[1] });
  }

  return chapters.length ? { slug, chapters } : null;
}

// ---------------- 7. MANGAFIRE / MREADER FALLBACK ----------------
async function scoutMangaFire(title) {
  const slug = toSlug(title);
  const html = await fetchHtml(`https://mangafire.to/manga/${slug}`);
  if (!html) return null;

  const chapters = [];
  const regex = /href=["'](\/read\/[^"']*?chapter-([0-9]+(?:\.[0-9]+)?)[^"']*?)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const num = cleanNum(match[2]);
    if (num !== null) {
      chapters.push({ chNum: num, url: `https://mangafire.to${match[1]}` });
    }
  }

  return chapters.length ? { slug, chapters } : null;
}

// ---------------- MAIN RECON MASTER ROUTINE ----------------
async function main() {
  console.log('=== MangaFlow Multi-Source Intelligence Engine (7 Sources Active) ===');

  const { data: targetSeries, error } = await supabase
    .from('series')
    .select('id, title, slug, english_title, synonyms')
    .order('updated_at', { ascending: true })
    .limit(50);

  if (error || !targetSeries) {
    console.error('Failed to load target series:', error);
    process.exit(1);
  }

  for (const s of targetSeries) {
    console.log(`\n🔍 [Reconnaissance] => ${s.title}`);

    // Query all 7 platforms concurrently for maximum speed
    const [hive, asura, flame, md, ck, mp, mf] = await Promise.all([
      scoutHiveToons(s.title),
      scoutAsura(s.title),
      scoutFlame(s.title),
      scoutMangaDex(s.title),
      scoutComicK(s.title),
      scoutMangaPill(s.title),
      scoutMangaFire(s.title),
    ]);

    const results = [
      { name: 'hivetoons', data: hive, max: hive?.chapters ? Math.max(...hive.chapters.map((c) => c.chNum)) : 0 },
      { name: 'asura', data: asura, max: asura?.chapters ? Math.max(...asura.chapters.map((c) => c.chNum)) : 0 },
      { name: 'flame', data: flame, max: flame?.chapters ? Math.max(...flame.chapters.map((c) => c.chNum)) : 0 },
      { name: 'mangadex', data: md, max: md?.chapters ? Math.max(...md.chapters.map((c) => c.chNum)) : 0 },
      { name: 'comick', data: ck, max: ck?.chapters ? Math.max(...ck.chapters.map((c) => c.chNum)) : 0 },
      { name: 'mangapill', data: mp, max: mp?.chapters ? Math.max(...mp.chapters.map((c) => c.chNum)) : 0 },
      { name: 'mangafire', data: mf, max: mf?.chapters ? Math.max(...mf.chapters.map((c) => c.chNum)) : 0 },
    ];

    for (const r of results) {
      if (r.data && r.data.chapters?.length) {
        console.log(`  -> [${r.name.toUpperCase()}] Verified ${r.data.chapters.length} chapters (Ceiling: Ch. ${r.max})`);
        
        await supabase.from('series_intel').upsert(
          {
            series_id: s.id,
            slug: s.slug,
            source_platform: r.name,
            target_url: r.data.url || r.data.slug || s.slug,
            target_identifier: r.data.hid || r.data.mangaId || r.data.slug,
            latest_known_chapter: r.max,
            verified_chapters: r.data.chapters,
            last_scouted_at: new Date().toISOString(),
          },
          { onConflict: 'series_id,source_platform' }
        );
      }
    }

    await delay(120);
  }

  console.log('\n=== Multi-Platform Recon Run Completed Successfully ===');
}

main().catch(console.error);
