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

// --- COMICK CHECKER ---
async function checkComicK(slugOrTitle) {
  const search = await safeFetchJson(
    `https://api.comick.io/v1.0/search?q=${encodeURIComponent(slugOrTitle)}&limit=5&type=comic`
  );
  if (!Array.isArray(search) || !search.length) return null;
  const comic = search[0];
  if (!comic?.hid) return null;

  const json = await safeFetchJson(
    `https://api.comick.io/comic/${comic.hid}/chapters?lang=en&page=1&limit=30`
  );
  if (!json?.chapters?.length) return null;

  const chapters = [];
  for (const c of json.chapters) {
    const num = cleanNum(c.chap);
    if (num !== null && c.hid) chapters.push({ chNum: num, hid: c.hid, title: c.title || null });
  }
  return { hid: comic.hid, slug: comic.slug, chapters };
}

// --- MANGADEX CHECKER ---
async function checkMangaDex(title) {
  const search = await safeFetchJson(
    `https://api.mangadex.org/manga?title=${encodeURIComponent(title)}&limit=3&order[relevance]=desc`
  );
  if (!search?.data?.length) return null;
  const mangaId = search.data[0]?.id;
  if (!mangaId) return null;

  const feed = await safeFetchJson(
    `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&limit=30&order[chapter]=desc`
  );
  if (!feed?.data?.length) return null;

  const chapters = [];
  for (const item of feed.data) {
    const num = cleanNum(item.attributes?.chapter);
    if (num !== null && item.id) {
      chapters.push({ chNum: num, id: item.id, title: item.attributes?.title || null });
    }
  }
  return { mangaId, chapters };
}

// --- MANGAPILL CHECKER ---
async function checkMangaPill(cleanTitle) {
  const html = await safeFetchHtml(`https://mangapill.com/search?q=${encodeURIComponent(cleanTitle)}`);
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
  return { slug, chapters };
}

// --- MAIN RADAR DISPATCHER ---
async function runReleaseRadar() {
  const now = new Date();
  const currentDayOfWeek = now.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const currentHourUTC = now.getUTCHours();

  console.log(`📡 [Radar Activated] UTC Day: ${currentDayOfWeek} | UTC Hour: ${currentHourUTC}:00`);

  // Target ONLY series due for release today OR delayed series whose retry timestamp has arrived
  const { data: radarTargets, error } = await supabase
    .from('series')
    .select('id, title, slug, english_title, delay_retry_count, next_attempt_at, sync_status')
    .eq('is_on_hiatus', false)
    .or(
      `and(release_day_of_week.eq.${currentDayOfWeek},release_hour_utc.lte.${currentHourUTC},sync_status.eq.IDLE),sync_status.eq.DELAYED`
    )
    .lte('next_attempt_at', now.toISOString())
    .limit(20);

  if (error) {
    console.error('Error fetching radar targets:', error);
    process.exit(1);
  }

  if (!radarTargets || radarTargets.length === 0) {
    console.log('✅ No series scheduled or delayed for this time window. Radar standing by.');
    return;
  }

  console.log(`🎯 Identified ${radarTargets.length} series in active drop window.`);

  for (const s of radarTargets) {
    console.log(`\n🔎 [Radar Checking] => ${s.title}`);

    // Fetch the current max chapter in our database
    const { data: currentMax } = await supabase
      .from('chapters')
      .select('chapter_number')
      .eq('series_id', s.id)
      .order('chapter_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentCeiling = currentMax?.chapter_number || 0;
    const lookupTitle = s.english_title || s.title;

    let discoveredChapters = [];
    let providerName = null;
    let targetIdentifier = null;

    // Check ComicK
    const ck = await checkComicK(lookupTitle);
    if (ck && ck.chapters.length) {
      discoveredChapters = ck.chapters;
      providerName = 'comick';
      targetIdentifier = ck.hid;
    }

    // Check MangaDex if ComicK didn't find newer
    if (!discoveredChapters.length) {
      const md = await checkMangaDex(lookupTitle);
      if (md && md.chapters.length) {
        discoveredChapters = md.chapters;
        providerName = 'mangadex';
        targetIdentifier = md.mangaId;
      }
    }

    // Check MangaPill fallback
    if (!discoveredChapters.length) {
      const mp = await checkMangaPill(lookupTitle);
      if (mp && mp.chapters.length) {
        discoveredChapters = mp.chapters;
        providerName = 'mangapill';
        targetIdentifier = mp.slug;
      }
    }

    const latestDiscovered = discoveredChapters.length
      ? Math.max(...discoveredChapters.map((c) => c.chNum))
      : 0;

    if (latestDiscovered > currentCeiling) {
      // NEW CHAPTER HAS DROPPED!
      console.log(`🔥 [NEW CHAPTER FOUND] Ch. ${latestDiscovered} detected via ${providerName}!`);

      await supabase.from('series_intel').upsert(
        {
          series_id: s.id,
          slug: s.slug,
          source_platform: providerName,
          target_identifier: targetIdentifier,
          latest_known_chapter: latestDiscovered,
          verified_chapters: discoveredChapters,
          last_scouted_at: new Date().toISOString(),
        },
        { onConflict: 'series_id,source_platform' }
      );

      // Flag for immediate worker download
      await supabase
        .from('series')
        .update({
          sync_status: 'RADAR_ACTIVE',
          updated_at: new Date().toISOString(),
        })
        .eq('id', s.id);
    } else {
      // Chapter has not dropped yet (Time delay or postponed)
      const currentRetries = (s.delay_retry_count || 0) + 1;

      if (currentRetries >= 8) {
        // Retried for ~3-4 hours without release: The chapter is postponed to next week
        console.log(`⏸️ [Postponed] ${s.title} exceeded 8 retry windows. Advancing to next week.`);
        await supabase.rpc('advance_series_to_next_cycle', {
          target_series_id: s.id,
          days_to_advance: 7,
        });
      } else {
        // Delayed: Retry in 25 minutes
        const retryInMinutes = 25;
        const nextAttempt = new Date(Date.now() + retryInMinutes * 60000).toISOString();
        console.log(`⏳ [Delayed] ${s.title} Ch. ${currentCeiling + 1} not dropped yet. Attempt #${currentRetries}. Next check: +${retryInMinutes}m`);

        await supabase
          .from('series')
          .update({
            sync_status: 'DELAYED',
            delay_retry_count: currentRetries,
            next_attempt_at: nextAttempt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', s.id);
      }
    }

    await delay(100);
  }

  console.log('\n📡 Radar cycle complete.');
}

runReleaseRadar().catch(console.error);
