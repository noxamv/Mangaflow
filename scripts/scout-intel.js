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

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/html,*/*',
  'Referer': 'https://comick.io/',
};

async function safeFetchJson(url) {
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

async function safeFetchHtml(url) {
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

function cleanNum(str) {
  if (!str) return null;
  const match = String(str).match(/[0-9]+(?:\.[0-9]+)?/);
  return match ? parseFloat(match[0]) : null;
}

// --- COMICK HARVESTER (Pulls all available chapters up to 40 pages) ---
async function harvestComicK(title) {
  const clean = title.replace(/['’]/g, '').trim();
  const search = await safeFetchJson(
    `https://api.comick.io/v1.0/search?q=${encodeURIComponent(clean)}&limit=5&type=comic`
  );
  if (!Array.isArray(search) || !search.length) return null;
  const comic = search[0];
  if (!comic?.hid) return null;

  const chapters = [];
  let page = 1;
  while (page <= 35) {
    const json = await safeFetchJson(
      `https://api.comick.io/comic/${comic.hid}/chapters?lang=en&page=${page}&limit=100`
    );
    if (!json?.chapters?.length) break;

    for (const c of json.chapters) {
      const num = cleanNum(c.chap);
      if (num !== null && c.hid) {
        chapters.push({ chNum: num, hid: c.hid, title: c.title || null });
      }
    }
    if (json.chapters.length < 100) break;
    page++;
    await delay(30);
  }
  return chapters.length ? { hid: comic.hid, slug: comic.slug, chapters } : null;
}

// --- MANGADEX HARVESTER (Deep offset pagination to bridge historical gaps) ---
async function harvestMangaDex(title) {
  const search = await safeFetchJson(
    `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=3&order[relevance]=desc`
  );
  if (!search?.data?.length) return null;
  const mangaId = search.data[0]?.id;
  if (!mangaId) return null;

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
    await delay(35);
  }
  return chapters.length ? { mangaId, chapters } : null;
}

// --- MANGAPILL HARVESTER ---
async function harvestMangaPill(title) {
  const clean = title.replace(/['’]/g, '').trim();
  const html = await safeFetchHtml(`https://mangapill.com/search?q=${encodeURIComponent(clean)}`);
  if (!html) return null;
  const match = html.match(/href="\/manga\/([0-9]+\/([^"]+))"/i);
  if (!match) return null;

  const slug = match[1];
  const pageHtml = await safeFetchHtml(`https://mangapill.com/manga/${slug}`);
  if (!pageHtml) return null;

  const chapters = [];
  const regex = /href="\/chapters\/([^"]+)"[^>]*>.*?chapter\s*([0-9]+(?:\.[0-9]+)?)/gi;
  let m;
  while ((m = regex.exec(pageHtml)) !== null) {
    const num = cleanNum(m[2]);
    if (num !== null) chapters.push({ chNum: num, chapterSlug: m[1] });
  }
  return chapters.length ? { slug, chapters } : null;
}

// --- SCOUT DISPATCHER ---
async function runScout() {
  console.log('=== MangaFlow Intelligent Dual Scout (New Drops + Gap Repair) ===');

  // 1. PULL TOP 10 TITLES WITH LARGEST GAPS FIRST
  const { data: gappedSeries } = await supabase
    .from('v_series_with_gaps')
    .select('series_id, title, slug, english_title, missing_count')
    .order('missing_count', { ascending: false })
    .limit(10);

  // 2. PULL TODAYS SCHEDULED DROPS
  const now = new Date();
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();

  const { data: scheduledSeries } = await supabase
    .from('series')
    .select('id, title, slug, english_title')
    .eq('is_on_hiatus', false)
    .eq('release_day_of_week', currentDay)
    .lte('release_hour_utc', currentHour)
    .limit(10);

  // Combine targets uniquely
  const targetMap = new Map();
  for (const s of gappedSeries || []) {
    targetMap.set(s.series_id, { id: s.series_id, title: s.title, slug: s.slug, english_title: s.english_title, isGap: true });
  }
  for (const s of scheduledSeries || []) {
    if (!targetMap.has(s.id)) {
      targetMap.set(s.id, { id: s.id, title: s.title, slug: s.slug, english_title: s.english_title, isGap: false });
    }
  }

  const targets = Array.from(targetMap.values());
  console.log(`🎯 Scout targeting ${targets.length} priority series (${gappedSeries?.length || 0} gap-heavy + ${scheduledSeries?.length || 0} scheduled drops).`);

  for (const s of targets) {
    console.log(`\n🔍 Scouting: ${s.title} ${s.isGap ? '[🚨 GAP REPAIR TARGET]' : '[DAILY DROP]'}`);

    const searchTitle = s.english_title || s.title;

    // Harvest ComicK
    try {
      const ck = await harvestComicK(searchTitle);
      if (ck && ck.chapters.length) {
        const maxCh = Math.max(...ck.chapters.map((c) => c.chNum));
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
        console.log(`  -> [ComicK] Harvested ${ck.chapters.length} chapters.`);
      }
    } catch (e) {
      console.warn('ComicK error:', e.message);
    }

    // Harvest MangaDex
    try {
      const md = await harvestMangaDex(searchTitle);
      if (md && md.chapters.length) {
        const maxCh = Math.max(...md.chapters.map((c) => c.chNum));
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
        console.log(`  -> [MangaDex] Harvested ${md.chapters.length} chapters.`);
      }
    } catch (e) {
      console.warn('MangaDex error:', e.message);
    }

    // Harvest MangaPill
    try {
      const mp = await harvestMangaPill(searchTitle);
      if (mp && mp.chapters.length) {
        const maxCh = Math.max(...mp.chapters.map((c) => c.chNum));
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
        console.log(`  -> [MangaPill] Harvested ${mp.chapters.length} chapters.`);
      }
    } catch (e) {
      console.warn('MangaPill error:', e.message);
    }

    // Flag as ready for worker ingestion
    await supabase
      .from('series')
      .update({ sync_status: 'RADAR_ACTIVE', updated_at: new Date().toISOString() })
      .eq('id', s.id);

    await delay(120);
  }

  console.log('\n✅ Scout finished successfully.');
}

runScout().catch(console.error);
