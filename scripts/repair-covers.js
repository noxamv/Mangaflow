import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchAniListCover(title) {
  const query = `
    query ($search: String) {
      Media (search: $search, type: MANGA) { coverImage { extraLarge } }
    }
  `;
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { search: title } })
    });
    const json = await res.json();
    return json?.data?.Media?.coverImage?.extraLarge || null;
  } catch { return null; }
}

async function repairCovers() {
  console.log('Scanning for broken covers...');
  
  // Find series with missing or broken cover URLs
  const { data: brokenSeries } = await supabase
    .from('series')
    .select('id, title, english_title, cover_image_url')
    .or('cover_image_url.is.null,cover_image_url.eq."",cover_image_url.ilike."%undefined%"');

  console.log(`Found ${brokenSeries.length} series needing cover repair.`);

  for (const s of brokenSeries) {
    const searchTitle = s.english_title || s.title;
    console.log(`Repairing: ${searchTitle}`);
    
    // Try AniList first (highest quality covers)
    let newCover = await fetchAniListCover(searchTitle);
    
    // Fallback to MangaDex if AniList fails
    if (!newCover) {
      const res = await fetch(`https://api.mangadex.org/manga?title=${encodeURIComponent(searchTitle)}&includes[]=cover_art`);
      const json = await res.json();
      const manga = json?.data?.[0];
      const coverArt = manga?.relationships?.find(r => r.type === 'cover_art');
      if (coverArt?.attributes?.fileName) {
        newCover = `https://uploads.mangadex.org/covers/${manga.id}/${coverArt.attributes.fileName}`;
      }
    }

    if (newCover) {
      await supabase.from('series').update({ cover_image_url: newCover }).eq('id', s.id);
      console.log(`   -> Fixed cover!`);
    } else {
      console.log(`   -> Could not find a cover.`);
    }
    
    // Wait 2 seconds to avoid rate limits
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log('Cover repair complete.');
}

repairCovers();
