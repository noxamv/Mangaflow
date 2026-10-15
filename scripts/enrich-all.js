import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Fatal Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// Disabling realtime transport prevents the WebSocket runtime crash
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    transport: null,
  },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchAniListMetadata(rawTitle) {
  const cleanTitle = rawTitle
    .replace(/[【】\[\]\(\)]/g, ' ')
    .replace(/["'""'']/g, '')
    .trim();

  const baseTitle = cleanTitle.split(/[~:–—\-]/)[0].trim();
  const searchCandidates = [...new Set([cleanTitle, baseTitle])].filter((t) => t.length >= 2);

  const query = `
    query ($search: String) {
      Media(search: $search, type: MANGA) {
        countryOfOrigin
        title {
          romaji
          english
          native
        }
        synonyms
        coverImage {
          extraLarge
          large
        }
      }
    }
  `;

  for (const term of searchCandidates) {
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { search: term },
        }),
      });

      if (res.status === 429) {
        console.warn('  [AniList] Rate limited. Pausing 60s...');
        await delay(60000);
        continue;
      }

      if (!res.ok) continue;

      const json = await res.json();
      const media = json?.data?.Media;
      if (media) return media;
    } catch {
      continue;
    }
    await delay(350);
  }

  return null;
}

async function runEnrichment() {
  console.log('Querying series requiring metadata enrichment...');

  const { data: list, error } = await supabase
    .from('series')
    .select('id, title, cover_url, english_title, native_title')
    .or('cover_url.is.null,english_title.is.null,native_title.is.null');

  if (error) {
    console.error('Database query error:', error.message);
    return;
  }

  if (!list || list.length === 0) {
    console.log('All series metadata and covers are 100% complete.');
    return;
  }

  console.log(`Found ${list.length} series to process.\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    console.log(`[${i + 1}/${list.length}] Searching: "${item.title}"`);

    const media = await fetchAniListMetadata(item.title);
    await delay(750);

    if (media) {
      const payload = {};

      if (!item.english_title && media.title?.english) {
        payload.english_title = media.title.english;
      }
      if (!item.native_title && media.title?.native) {
        payload.native_title = media.title.native;
      }
      if (media.countryOfOrigin) {
        payload.country_of_origin = media.countryOfOrigin;
      }
      if (Array.isArray(media.synonyms) && media.synonyms.length > 0) {
        payload.synonyms = media.synonyms;
      }

      const cover = media.coverImage?.extraLarge || media.coverImage?.large;
      if (!item.cover_url && cover) {
        payload.cover_url = cover;
      }

      if (Object.keys(payload).length > 0) {
        const { error: updateErr } = await supabase
          .from('series')
          .update(payload)
          .eq('id', item.id);

        if (updateErr) {
          console.error(`  ✗ DB update failed: ${updateErr.message}`);
          failCount++;
        } else {
          console.log(`  ✓ Updated metadata`);
          successCount++;
        }
      } else {
        console.log(`  - No missing fields to update`);
      }
    } else {
      console.warn(`  ✗ Unmatched on AniList`);
      failCount++;
    }
  }

  console.log(`\nFinished: ${successCount} updated, ${failCount} unmatched.`);
}

runEnrichment().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
