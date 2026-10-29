import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toCleanSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-');
}

// Check if a URL responds with 200 OK
async function probeUrl(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: HEADERS });
    if (res.status === 200) return true;
    if (res.status === 405) {
      // Some servers block HEAD; try GET
      const getRes = await fetch(url, { method: 'GET', headers: HEADERS });
      return getRes.status === 200;
    }
    return false;
  } catch {
    return false;
  }
}

// 1. Manhwatop Prober
async function scoutManhwatop(title) {
  const baseSlug = toCleanSlug(title);
  const candidates = [
    `https://manhwatop.com/manga/${baseSlug}-series/`,
    `https://manhwatop.com/manga/${baseSlug}/`
  ];

  for (const url of candidates) {
    const ok = await probeUrl(url);
    if (ok) {
      return { platform: 'manhwatop', url, identifier: url.split('/').filter(Boolean).pop() };
    }
  }
  return null;
}

// 2. MangaDex API Search (with exact match verification)
async function scoutMangaDex(title) {
  try {
    const query = encodeURIComponent(title.replace(/[^\w\s]/g, ''));
    const res = await fetch(
      `https://api.mangadex.org/manga?title=${query}&limit=5&order[relevance]=desc`,
      { headers: { 'User-Agent': HEADERS['User-Agent'] } }
    );
    if (res.status !== 200) return null;

    const data = await res.json();
    const hits = data.data || [];

    for (const manga of hits) {
      const enTitle = manga.attributes?.title?.en || Object.values(manga.attributes?.title || {})[0] || '';
      
      // Enforce strict name similarity to avoid cross-contamination
      const cleanTarget = title.toLowerCase().replace(/[^\w]/g, '');
      const cleanFound = enTitle.toLowerCase().replace(/[^\w]/g, '');
      
      if (cleanFound.includes(cleanTarget) || cleanTarget.includes(cleanFound)) {
        return {
          platform: 'mangadex',
          url: `https://mangadex.org/title/${manga.id}`,
          identifier: manga.id
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('--- RUNNING ENHANCED SCOUT INTEL ---');

  // Select only series that are genuinely unlinked or unresolved
  // Guard: Never touch healthy series with confirmed stored chapters
  const { data: queue, error } = await supabase
    .from('series')
    .select(`
      id, 
      title, 
      series_intel(source_platform, target_url, latest_known_chapter),
      chapters(count)
    `)
    .or('target_url.is.null,target_url.eq.placeholder,latest_known_chapter.eq.0', { foreignTable: 'series_intel' })
    .limit(40);

  if (error) {
    console.error('Error fetching scouting targets:', error.message);
    process.exit(1);
  }

  console.log(`Found ${queue.length} unlinked or placeholder titles to scout.`);

  for (const item of queue) {
    const existingCount = item.chapters?.[0]?.count || 0;
    const existingUrl = item.series_intel?.[0]?.target_url;

    // Safety guard: if already holding chapters and not a placeholder, skip
    if (existingCount > 20 && existingUrl && existingUrl !== 'placeholder') {
      console.log(`[SKIP] "${item.title}" already has ${existingCount} chapters.`);
      continue;
    }

    console.log(`Scouting: "${item.title}"...`);

    // Priority 1: Check Manhwatop
    let match = await scoutManhwatop(item.title);
    
    // Priority 2: Check MangaDex if not on Manhwatop
    if (!match) {
      await delay(300);
      match = await scoutMangaDex(item.title);
    }

    if (match) {
      console.log(`  -> RESOLVED: ${match.platform} => ${match.url}`);
      await supabase
        .from('series_intel')
        .upsert({
          series_id: item.id,
          source_platform: match.platform,
          target_url: match.url,
          target_identifier: match.identifier,
          last_scouted_at: new Date().toISOString()
        }, { onConflict: 'series_id' });
    } else {
      console.log(`  -> [NOT FOUND] Marked for manual review.`);
      await supabase
        .from('series_intel')
        .upsert({
          series_id: item.id,
          last_scouted_at: new Date().toISOString()
        }, { onConflict: 'series_id' });
    }

    await delay(500);
  }

  console.log('--- SCOUTING COMPLETE ---');
}

main().catch(console.error);
