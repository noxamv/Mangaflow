import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MANGADEX_API = 'https://api.mangadex.org';

// Helper 1: Fetch official extra-large cover from AniList
async function fetchAniListCover(title) {
  const cleanTitle = title
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .trim();

  const query = `
    query ($search: String) {
      Media(search: $search, type: MANGA) {
        coverImage {
          extraLarge
          large
        }
      }
    }
  `;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { search: cleanTitle },
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.Media?.coverImage?.extraLarge || json?.data?.Media?.coverImage?.large || null;
  } catch {
    return null;
  }
}

// Helper 2: Fallback to MangaDex cover API if AniList doesn't match
async function fetchMangaDexCover(title) {
  try {
    const cleanTitle = title.replace(/\[.*?\]|\(.*?\)/g, '').trim();
    const res = await fetch(`${MANGADEX_API}/manga?title=${encodeURIComponent(cleanTitle)}&limit=1&includes[]=cover_art`, {
      headers: { 'User-Agent': 'MangaFlow/2.0' }
    });
    if (!res.ok) return null;
    const json = await res.json();
    const manga = json?.data?.[0];
    if (!manga) return null;

    const coverRel = manga.relationships?.find(r => r.type === 'cover_art');
    const fileName = coverRel?.attributes?.fileName;
    if (fileName) {
      return `https://uploads.mangadex.org/covers/${manga.id}/${fileName}`;
    }
    return null;
  } catch {
    return null;
  }
}

async function repair() {
  console.log('Fetching all series missing covers...');

  const { data: missingList, error } = await supabase
    .from('series')
    .select('id, title')
    .is('cover_url', null);

  if (error || !missingList || missingList.length === 0) {
    console.log('No series require cover repair.');
    return;
  }

  console.log(`Found ${missingList.length} titles needing real covers.\n`);

  let count = 0;
  for (const s of missingList) {
    console.log(`[${++count}/${missingList.length}] Repairing: "${s.title}"...`);

    // 1. Try AniList first (clearest official art)
    let coverUrl = await fetchAniListCover(s.title);
    await delay(700); // AniList rate-limit protection

    // 2. Fallback to MangaDex if AniList misses
    if (!coverUrl) {
      coverUrl = await fetchMangaDexCover(s.title);
      await delay(350);
    }

    if (coverUrl) {
      const { error: updErr } = await supabase
        .from('series')
        .update({ cover_url: coverUrl })
        .eq('id', s.id);

      if (!updErr) {
        console.log(`  ✓ Saved: ${coverUrl}`);
      } else {
        console.error(`  ✗ DB Update Failed: ${updErr.message}`);
      }
    } else {
      console.warn(`  ✗ Cover not found for "${s.title}"`);
    }
  }

  console.log('\nAll missing covers processed.');
}

repair();
