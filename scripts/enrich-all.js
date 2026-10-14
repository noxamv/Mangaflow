import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Fatal: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchAniListMetadata(title) {
  const cleanTitle = title
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .trim();

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
    return json?.data?.Media || null;
  } catch {
    return null;
  }
}

async function runEnrichment() {
  console.log('Querying series lacking English or Native titles...');

  const { data: list, error } = await supabase
    .from('series')
    .select('id, title, cover_url')
    .or('english_title.is.null,native_title.is.null');

  if (error || !list || list.length === 0) {
    console.log('No series require enrichment.');
    return;
  }

  console.log(`Found ${list.length} titles to enrich with AniList data.\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    console.log(`[${i + 1}/${list.length}] Searching: "${item.title}"...`);

    const media = await fetchAniListMetadata(item.title);
    await delay(750); // Respect AniList rate limit (90 requests/minute)

    if (media) {
      const payload = {
        english_title: media.title?.english || null,
        native_title: media.title?.native || null,
        country_of_origin: media.countryOfOrigin || null,
        synonyms: media.synonyms || [],
      };

      // If the series still doesn't have a valid cover, fill it in too
      if (!item.cover_url && (media.coverImage?.extraLarge || media.coverImage?.large)) {
        payload.cover_url = media.coverImage.extraLarge || media.coverImage.large;
      }

      const { error: updateErr } = await supabase
        .from('series')
        .update(payload)
        .eq('id', item.id);

      if (!updateErr) {
        console.log(`  ✓ Origin: [${payload.country_of_origin || '?'}] | EN: "${payload.english_title || 'N/A'}" | Native: "${payload.native_title || 'N/A'}"`);
        successCount++;
      } else {
        console.error(`  ✗ DB Error: ${updateErr.message}`);
        failCount++;
      }
    } else {
      console.warn(`  ✗ Not found on AniList: "${item.title}"`);
      failCount++;
    }
  }

  console.log('\n========================================');
  console.log(`Enrichment complete: ${successCount} updated, ${failCount} skipped/not found.`);
  console.log('========================================');
}

runEnrichment().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
