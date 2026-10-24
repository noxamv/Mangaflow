// scripts/scout-intel.js
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

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://comick.io/',
};

async function safeFetchJson(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
    clearTimeout(timeout);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function safeFetchHtml(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
    clearTimeout(timeout);
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

// --- COMICK HARVESTER ---
async function harvestComicK(searchTerms) {
  for (const term of searchTerms) {
    if (!term || isNovel(term)) continue;
    const clean = term.replace(/['’]/g, '').trim();

    const search = await safeFetchJson(
      `https://api.comick.io/v1.0/search?q=${encodeURIComponent(clean)}&limit=8&type=comic`
    );
    if (!Array.isArray(search) || !search.length) continue;

    const comic =
      search.find((c) => c.comic_type !== 'novel' && !isNovel(c.title) && !c.slug?.includes('novel')) ||
      search[0];
    if (!comic?.hid) continue;

    const chapters = [];
    let page = 1;
    while (page <= 40) {
      const json = await safeFetchJson(
        `https://api.comick.io/comic/${comic.hid}/chapters?lang=en&page=${page}&limit=100`
      );
      if (!json?.chapters?.length) break;

      for (const c of json.chapters) {
        if (isNovel(c.title)) continue;
        const num = cleanNum(c.chap);
        if (num !== null && c.hid) {
          chapters.push({ chNum: num, hid: c.hid, title: c.title || null });
        }
      }
      if (json.chapters.length < 100) break;
      page++;
      await delay(30);
    }

    if (chapters.length > 0) {
      return { hid: comic.hid, slug: comic.slug, chapters };
    }
  }
  return null;
}

// --- MANGADEX HARVESTER ---
async function harvestMangaDex(searchTerms) {
  for (const term of searchTerms) {
    if (!term || isNovel(term)) continue;

    const json = await safeFetchJson(
      `https://api.mangadex.org/manga?title=${encodeURIComponent(term)}&limit=5&order[relevance]=desc`
    );
    if (!json?.data?.length) continue;

    const manga =
      json.data.find((m) => {
        const en = (m.attributes?.title?.en || Object.values(m.attributes?.title || {})[0] || '').toLowerCase();
        return !en.includes('(novel)') && !en.includes('[novel]');
      }) || json.data[0];

    const mangaId = manga?.id;
    if (!mangaId) continue;

    const chapters = [];
    let offset = 0;
    while (offset <= 1500) {
      const feed = await safeFetchJson(
        `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&limit=100&offset=${offset}&order[chapter]=desc`
      );
      if (!feed?.data?.length) break;

      for (const item of feed.data) {
        const num = cleanNum(item.attributes?.chapter);
        if (num !== null && item.id) {
          chapters.push({ chNum: num, id: item.id, title: item.attributes?.title || null });
        }
      }
      if (feed.data.length < 100) break;
      offset += 100;
      await delay(40);
    }

    if (chapters.length > 0) {
      return { mangaId, chapters };
    }
  }
  return null;
}

// --- MANGAPILL HARVESTER ---
async function harvestMangaPill(searchTerms) {
  for (const term of searchTerms) {
    if (!term || isNovel(term) || !/^[\x00-\x7F]+$/.test(term)) continue;

    const clean = term.replace(/['’]/g, '').trim();
    const html = await safeFetchHtml(`https://mangapill.com/search?q=${encodeURIComponent(clean)}`);
    if (!html) continue;

    const match = html.match(/href="\/manga\/([0-9]+\/([^"]+))"/i);
    if (!match) continue;

    const slug = match[1];
    const pageHtml = await safeFetchHtml(`https://mangapill.com/manga/${slug}`);
    if (!pageHtml) continue;

    const chapters = [];
    const regex = /href="\/chapters\/([^"]+)"[^>]*>.*?chapter\s*([0-9]+(?:\.[0-9]+)?)/gi;
    let m;
    while ((m = regex.exec(pageHtml)) !== null) {
      const num = cleanNum(m[2]);
      if (num !== null) chapters.push({ chNum: num, chapterSlug: m[1] });
    }

    if (chapters.length > 0) {
      return { slug, chapters };
    }
  }
  return null;
}

// --- CONTINUOUS QUEUE RECON ENGINE ---
async function runReconEngine() {
  console.log('=== MangaFlow Autonomous Recon Engine Initialized ===');

  // Pull batch of 40 oldest series
  const { data: targetSeries, error } = await supabase
    .from('series')
    .select('id, title, slug, english_title, native_title, synonyms')
    .order('updated_at', { ascending: true })
    .limit(40);

  if (error || !targetSeries) {
    console.error('Failed to query series backlog:', error);
    process.exit(1);
  }

  for (const s of targetSeries) {
    console.log(`\n🔍 [Scouting] => ${s.title}`);

    // PERMANENT FIX: Bump timestamp immediately so queue always rotates
    await supabase
      .from('series')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', s.id);

    // Build intelligent alias array
    const aliases = [s.title, s.english_title, s.slug.replace(/-/g, ' ')];
    if (s.slug === 'star-martial-god-technique') aliases.unshift('Star Martial God Technique');
    if (Array.isArray(s.synonyms)) {
      aliases.push(...s.synonyms);
    } else if (typeof s.synonyms === 'string') {
      try {
        const parsed = JSON.parse(s.synonyms);
        if (Array.isArray(parsed)) aliases.push(...parsed);
      } catch {
        aliases.push(...s.synonyms.split(/[,;\n]/));
      }
    }

    const uniqueAliases = [...new Set(aliases.filter(Boolean))];

    // Harvest ComicK
    try {
      const ck = await harvestComicK(uniqueAliases);
      if (ck && ck.chapters.length) {
        const maxCh = Math.max(...ck.chapters.map((c) => c.chNum));
        console.log(`  -> [ComicK] ${ck.chapters.length} chapters (Max: Ch. ${maxCh})`);
        await supabase.from('series_intel').upsert(
          {
            series_id: s.id,
            slug: s.slug,
            source_platform: 'comick',
            target_url: `https://comick.io/comic/${ck.slug}`,
            target_identifier: ck.hid,
            latest_known_chapter: maxCh,
            verified_chapters: ck.chapters,
            last_scouted_at: new Date().toISOString(),
          },
          { onConflict: 'series_id,source_platform' }
        );
      }
    } catch (err) {
      console.warn(`  ! ComicK failed on ${s.title}: ${err.message}`);
    }

    // Harvest MangaDex
    try {
      const md = await harvestMangaDex(uniqueAliases);
      if (md && md.chapters.length) {
        const maxCh = Math.max(...md.chapters.map((c) => c.chNum));
        console.log(`  -> [MangaDex] ${md.chapters.length} chapters (Max: Ch. ${maxCh})`);
        await supabase.from('series_intel').upsert(
          {
            series_id: s.id,
            slug: s.slug,
            source_platform: 'mangadex',
            target_url: `https://mangadex.org/title/${md.mangaId}`,
            target_identifier: md.mangaId,
            latest_known_chapter: maxCh,
            verified_chapters: md.chapters,
            last_scouted_at: new Date().toISOString(),
          },
          { onConflict: 'series_id,source_platform' }
        );
      }
    } catch (err) {
      console.warn(`  ! MangaDex failed on ${s.title}: ${err.message}`);
    }

    // Harvest MangaPill
    try {
      const mp = await harvestMangaPill(uniqueAliases);
      if (mp && mp.chapters.length) {
        const maxCh = Math.max(...mp.chapters.map((c) => c.chNum));
        console.log(`  -> [MangaPill] ${mp.chapters.length} chapters (Max: Ch. ${maxCh})`);
        await supabase.from('series_intel').upsert(
          {
            series_id: s.id,
            slug: s.slug,
            source_platform: 'mangapill',
            target_url: `https://mangapill.com/manga/${mp.slug}`,
            target_identifier: mp.slug,
            latest_known_chapter: maxCh,
            verified_chapters: mp.chapters,
            last_scouted_at: new Date().toISOString(),
          },
          { onConflict: 'series_id,source_platform' }
        );
      }
    } catch (err) {
      console.warn(`  ! MangaPill failed on ${s.title}: ${err.message}`);
    }

    await delay(100);
  }

  console.log('\n=== Recon Cycle Completed ===');
}

runReconEngine().catch(console.error);
