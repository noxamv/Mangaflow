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
  'Accept': 'application/json,text/html,*/*',
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

// SCOUT SOURCES
async function scoutHiveToons(slug) {
  const html = await fetchHtml(`https://hivetoons.org/series/${slug}`);
  if (!html) return null;

  const chapters = [];
  const regex = /href=["'](https?:\/\/hivetoons\.org\/series\/[^"']*?chapter-([0-9]+(?:\.[0-9]+)?)[^"']*?)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const num = cleanNum(match[2]);
    if (num !== null) {
      chapters.push({ chNum: num, url: match[1] });
    }
  }
  return chapters;
}

async function scoutAsura(slug) {
  const html = await fetchHtml(`https://asuracomic.net/series/${slug}`);
  if (!html) return null;

  const chapters = [];
  const regex = /href=["'](https?:\/\/[^"']*?chapter\/([0-9]+(?:\.[0-9]+)?)[^"']*?)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const num = cleanNum(match[2]);
    if (num !== null) {
      chapters.push({ chNum: num, url: match[1] });
    }
  }
  return chapters;
}

async function scoutComicK(query) {
  const clean = query.replace(/['’]/g, '').trim();
  const search = await fetchJson(`https://api.comick.io/v1.0/search?q=${encodeURIComponent(clean)}&limit=5&type=comic`);
  if (!Array.isArray(search) || !search.length) return null;

  const comic = search.find((c) => c.comic_type !== 'novel' && !c.slug?.includes('novel')) || search[0];
  if (!comic?.hid) return null;

  // Probe chapter list
  const chapters = [];
  let page = 1;
  while (page <= 25) {
    const json = await fetchJson(`https://api.comick.io/comic/${comic.hid}/chapters?lang=en&page=${page}&limit=100`);
    if (!json?.chapters?.length) break;
    for (const c of json.chapters) {
      const num = cleanNum(c.chap);
      if (num !== null && c.hid) {
        chapters.push({ chNum: num, hid: c.hid });
      }
    }
    if (json.chapters.length < 100) break;
    page++;
    await delay(30);
  }

  return { hid: comic.hid, slug: comic.slug, chapters };
}

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
    if (num !== null) {
      chapters.push({ chNum: num, chapterSlug: m[1] });
    }
  }

  return { slug, chapters };
}

async function main() {
  console.log('=== MangaFlow Intel Scout Bot Active ===');

  // Pull series with known gaps or outdated intel
  const { data: targetSeries, error } = await supabase
    .from('series')
    .select('id, title, slug, english_title, synonyms')
    .order('updated_at', { ascending: true })
    .limit(50);

  if (error || !targetSeries) {
    console.error('Failed to load targets:', error);
    process.exit(1);
  }

  for (const s of targetSeries) {
    console.log(`\n[Scouting Intel] => ${s.title}`);

    // 1. Hive Toons Check (Manhwa)
    const hiveSlug = s.slug.includes('lookism') ? 'lookism' : s.slug.includes('eleceed') ? 'eleceed' : null;
    if (hiveSlug) {
      const hiveChapters = await scoutHiveToons(hiveSlug);
      if (hiveChapters?.length) {
        const maxCh = Math.max(...hiveChapters.map((c) => c.chNum));
        console.log(`  -> HiveToons Intel: Found ${hiveChapters.length} chapters (Max: ${maxCh})`);
        await supabase.from('series_intel').upsert(
          {
            series_id: s.id,
            slug: s.slug,
            source_platform: 'hivetoons',
            target_url: `https://hivetoons.org/series/${hiveSlug}`,
            target_identifier: hiveSlug,
            latest_known_chapter: maxCh,
            verified_chapters: hiveChapters,
            last_scouted_at: new Date().toISOString(),
          },
          { onConflict: 'series_id,source_platform' }
        );
      }
    }

    // 2. ComicK Intel Check
    const ckIntel = await scoutComicK(s.title);
    if (ckIntel && ckIntel.chapters.length) {
      const maxCh = Math.max(...ckIntel.chapters.map((c) => c.chNum));
      console.log(`  -> ComicK Intel: Found ${ckIntel.chapters.length} chapters (Max: ${maxCh})`);
      await supabase.from('series_intel').upsert(
        {
          series_id: s.id,
          slug: s.slug,
          source_platform: 'comick',
          target_url: `https://comick.io/comic/${ckIntel.slug}`,
          target_identifier: ckIntel.hid,
          latest_known_chapter: maxCh,
          verified_chapters: ckIntel.chapters,
          last_scouted_at: new Date().toISOString(),
        },
        { onConflict: 'series_id,source_platform' }
      );
    }

    // 3. MangaPill Intel Check
    const mpIntel = await scoutMangaPill(s.title);
    if (mpIntel && mpIntel.chapters.length) {
      const maxCh = Math.max(...mpIntel.chapters.map((c) => c.chNum));
      console.log(`  -> MangaPill Intel: Found ${mpIntel.chapters.length} chapters (Max: ${maxCh})`);
      await supabase.from('series_intel').upsert(
        {
          series_id: s.id,
          slug: s.slug,
          source_platform: 'mangapill',
          target_url: `https://mangapill.com/manga/${mpIntel.slug}`,
          target_identifier: mpIntel.slug,
          latest_known_chapter: maxCh,
          verified_chapters: mpIntel.chapters,
          last_scouted_at: new Date().toISOString(),
        },
        { onConflict: 'series_id,source_platform' }
      );
    }

    await delay(150);
  }

  console.log('=== Intel Gathering Run Complete ===');
}

main().catch(console.error);
