// scripts/repair-catalog-metadata.js
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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

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

async function fetchAniListMetadata(title) {
  const query = `
    query ($search: String) {
      Media (search: $search, type: MANGA) {
        description(asHtml: false)
        coverImage { extraLarge large }
        status
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
    const media = json?.data?.Media;
    if (!media) return null;

    return {
      description: media.description || null,
      coverUrl: media.coverImage?.extraLarge || media.coverImage?.large || null,
      status: media.status === 'FINISHED' ? 'Completed' : 'Ongoing'
    };
  } catch {
    return null;
  }
}

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

async function repairCatalogMetadata() {
  console.log('--- SCANNING CATALOG FOR MISSING COVERS & BIOS ---');

  const { data: allSeries, error } = await supabase
    .from('series')
    .select('id, title, english_title, cover_url, cover_image_url, description')
    .order('created_at', { ascending: false });

  if (error || !allSeries) {
    console.error('[DB Error]:', error?.message);
    return;
  }

  const needsRepair = allSeries.filter((s) => {
    const cover = s.cover_image_url || s.cover_url || '';
    const bio = s.description || '';
    return (
      !cover ||
      cover.trim() === '' ||
      cover.includes('MISSING') ||
      cover.includes('undefined') ||
      cover.includes('placeholder') ||
      !bio ||
      bio.trim() === ''
    );
  });

  console.log(`Found ${needsRepair.length} series needing cover or bio repair out of ${allSeries.length} total.`);

  let repairedCount = 0;

  for (const s of needsRepair) {
    const title = s.english_title || s.title;
    console.log(`Repairing metadata for: "${title}"`);

    const meta = await fetchAniListMetadata(title);
    let newCover = meta?.coverUrl;
    const newBio = meta?.description;

    if (!newCover) {
      newCover = await fetchMangaDexCover(title);
    }

    const updatePayload = {};
    if (newCover && (!s.cover_url || s.cover_url.includes('MISSING') || s.cover_url.includes('placeholder'))) {
      updatePayload.cover_url = newCover;
      updatePayload.cover_image_url = newCover;
    }
    if (newBio && (!s.description || s.description.trim() === '')) {
      updatePayload.description = newBio;
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateErr } = await supabase
        .from('series')
        .update(updatePayload)
        .eq('id', s.id);

      if (!updateErr) {
        console.log(`   [SUCCESS] Repaired fields: ${Object.keys(updatePayload).join(', ')}`);
        repairedCount++;
      }
    } else {
      console.log(`   [SKIP] No external metadata found.`);
    }

    await delay(600);
  }

  console.log(`\n--- CATALOG METADATA REPAIR COMPLETE: Repaired ${repairedCount} series ---`);
}

repairCatalogMetadata().catch(console.error);
