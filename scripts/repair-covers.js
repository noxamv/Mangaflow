// scripts/repair-covers.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[FATAL] Missing Supabase credentials.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanTitle(str) {
  return (str || '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 1. ANILIST GRAPHQL
async function fetchAniListCover(title) {
  const query = `
    query ($search: String) {
      Media (search: $search, type: MANGA) {
        coverImage { extraLarge large }
      }
    }
  `;
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables: { search: cleanTitle(title) } })
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.Media?.coverImage?.extraLarge || json?.data?.Media?.coverImage?.large || null;
  } catch {
    return null;
  }
}

// 2. MANGADEX API FALLBACK
async function fetchMangaDexCover(title) {
  try {
    const res = await fetch(
      `https://api.mangadex.org/manga?title=${encodeURIComponent(cleanTitle(title))}&limit=1&includes[]=cover_art`,
      { headers: HEADERS }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const manga = json?.data?.[0];
    const coverArt = manga?.relationships?.find((r) => r.type === 'cover_art');
    if (coverArt?.attributes?.fileName && manga?.id) {
      return `https://uploads.mangadex.org/covers/${manga.id}/${coverArt.attributes.fileName}.512.jpg`;
    }
  } catch {}
  return null;
}

// 3. MANGAPILL FALLBACK
async function fetchMangaPillCover(title) {
  try {
    const res = await fetch(`https://mangapill.com/search?q=${encodeURIComponent(cleanTitle(title))}`, {
      headers: HEADERS
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*alt=["'][^"']*["']/i);
    if (match && match[1]) {
      return match[1].startsWith('http') ? match[1] : `https://mangapill.com${match[1]}`;
    }
  } catch {}
  return null;
}

async function repairCovers() {
  console.log('--- SCANNING FOR MISSING AND BROKEN COVERS ---');

  const { data: allSeries, error } = await supabase
    .from('series')
    .select('id, title, english_title, cover_url, cover_image_url')
    .order('created_at', { ascending: false });

  if (error || !allSeries) {
    console.error('[DB Error]:', error?.message);
    return;
  }

  const needsRepair = allSeries.filter((s) => {
    const url = s.cover_image_url || s.cover_url || '';
    return (
      !url ||
      url.trim() === '' ||
      url.includes('undefined') ||
      url.includes('placeholder') ||
      url.startsWith('data:image/svg')
    );
  });

  console.log(`Found ${needsRepair.length} series needing cover repair out of ${allSeries.length} total.`);

  let repairedCount = 0;

  for (const s of needsRepair) {
    const title = s.english_title || s.title;
    console.log(`Fixing cover for: "${title}"`);

    let newCover = await fetchAniListCover(title);
    if (!newCover) {
      newCover = await fetchMangaDexCover(title);
    }
    if (!newCover) {
      newCover = await fetchMangaPillCover(title);
    }

    if (newCover) {
      const { error: updateErr } = await supabase
        .from('series')
        .update({
          cover_image_url: newCover,
          cover_url: newCover
        })
        .eq('id', s.id);

      if (!updateErr) {
        console.log(`   [SUCCESS] Updated cover: ${newCover}`);
        repairedCount++;
      }
    } else {
      console.log(`   [SKIP] No external cover found.`);
    }

    await delay(700);
  }

  console.log(`\n--- COVER REPAIR COMPLETE: Repaired ${repairedCount} series ---`);
}

repairCovers().catch(console.error);
