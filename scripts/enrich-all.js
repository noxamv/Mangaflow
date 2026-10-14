import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Fatal: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: null },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchAniListMetadata(rawTitle) {
  // Candidate cleanups:
  // 1. Remove brackets like 【 】, [ ], ( )
  const noBrackets = rawTitle
    .replace(/[【】\[\]\(\)]/g, ' ')
    .replace(/["'""'']/g, '')
    .trim();

  // 2. Strip subtitles after "~", ":", or "-"
  const baseTitle = noBrackets.split(/[~:–—\-]/)[0].trim();

  // Try queries in order of specificity
  const searchCandidates = [...new Set([noBrackets, baseTitle])].filter((t) => t.length >= 2);

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
        console.warn('Rate limited. Waiting 60s...');
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
  console.log('Querying series needing metadata enrichment...');

  const { data: list, error } = await supabase
    .from('series')
    .select('id, title, cover_url')
    .or('english_title.is.null,native_title.is.null');

  if (error || !list || list.length === 0) {
    console.log('All series metadata is complete.');
    return;
  }

  console.log(`Processing ${list.length} titles...\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    console.log(`[${i + 1}/${list.length}] Searching: "${item.title}"...`);

    const media = await fetchAniListMetadata(item.title);
    await delay(750);

    if (media) {
      const payload = {
        english_title: media.title?.english || null,
        native_title: media.title?.native || null,
        country_of_origin: media.countryOfOrigin || null,
        synonyms: media.synonyms || [],
      };

      if (!item.cover_url && (media.coverImage?.extraLarge || media.coverImage?.large)) {
        payload.cover_url = media.coverImage.extraLarge || media.coverImage.large;
      }

      const { error: updateErr } = await supabase
        .from('series')
        .update(payload)
        .eq('id', item.id);

      if (!updateErr) {
        console.log(`  ✓ Found: [${payload.country_of_origin}] EN: "${payload.english_title || 'N/A'}"`);
        successCount++;
      } else {
        console.error(`  ✗ DB Error: ${updateErr.message}`);
        failCount++;
      }
    } else {
      console.warn(`  ✗ Unmatched: "${item.title}"`);
      failCount++;
    }
  }

  console.log(`\nDone: ${successCount} updated, ${failCount} unmatched.`);
}

runEnrichment().catch(console.error);
