// scripts/normalize-titles.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[FATAL] Missing Supabase credentials.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function generateSlug(title) {
  const primary = (title || '').split(/[\n\r]/)[0];
  return primary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanSearchTerm(term) {
  return (term || '')
    .replace(/["“”'']/g, '')
    .replace(/@comic/gi, '')
    .replace(/~.*?~/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSearchCandidates(rawTitle) {
  if (!rawTitle) return [];
  const lines = rawTitle
    .split(/[\r\n]+/)
    .map((l) => cleanSearchTerm(l))
    .filter((l) => l.length > 1);

  const candidates = new Set();

  for (const line of lines) {
    candidates.add(line);

    // Segment before colon, dash, or pipe
    const mainSegment = line.split(/[:\-\|]/)[0].trim();
    if (mainSegment.length > 2 && mainSegment !== line) {
      candidates.add(mainSegment);
    }

    // Strip parentheses content
    const noParens = line.replace(/\(.*?\)|\[.*?\]/g, '').trim();
    if (noParens.length > 2) {
      candidates.add(noParens);
    }
  }

  return Array.from(candidates);
}

async function fetchAniListMetadata(candidates) {
  const query = `
    query ($search: String) {
      Media (search: $search, type: MANGA) {
        title { romaji english native }
        description(asHtml: false)
        coverImage { extraLarge large }
        status
      }
    }
  `;

  for (const term of candidates) {
    if (!term || term.length < 2) continue;
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { search: term } }),
      });

      if (res.status === 429) {
        await delay(1500);
        continue;
      }
      if (!res.ok) continue;

      const json = await res.json();
      const media = json?.data?.Media;
      const cover = media?.coverImage?.extraLarge || media?.coverImage?.large || null;
      const desc = media?.description ? media.description.replace(/<[^>]*>?/gm, '').trim() : null;

      if (cover || desc) {
        return {
          coverUrl: cover,
          description: desc,
          status: media.status === 'FINISHED' ? 'Completed' : 'Ongoing',
        };
      }
    } catch {}
    await delay(300);
  }
  return null;
}

async function fetchMangaDexMetadata(candidates) {
  for (const term of candidates) {
    if (!term || term.length < 2) continue;
    try {
      const encoded = encodeURIComponent(term);
      const url = `https://api.mangadex.org/manga?title=${encoded}&limit=1&includes[]=cover_art`;
      const res = await fetch(url, { headers: { 'User-Agent': 'MangaFlow/1.0' } });

      if (res.status === 429) {
        await delay(1500);
        continue;
      }
      if (!res.ok) continue;

      const json = await res.json();
      const manga = json?.data?.[0];
      if (!manga) continue;

      const mangaId = manga.id;
      const attributes = manga.attributes || {};
      const desc =
        attributes.description?.en || Object.values(attributes.description || {})[0] || null;

      let coverUrl = null;
      const coverRel = manga.relationships?.find((r) => r.type === 'cover_art');
      if (coverRel && coverRel.attributes?.fileName) {
        coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${coverRel.attributes.fileName}.512.jpg`;
      }

      if (coverUrl || desc) {
        return {
          coverUrl,
          description: desc ? desc.replace(/<[^>]*>?/gm, '').trim() : null,
          status: attributes.status === 'completed' ? 'Completed' : 'Ongoing',
        };
      }
    } catch {}
    await delay(300);
  }
  return null;
}

async function runNormalizationAndRecovery() {
  console.log('--- STARTING TARGETED COVER & METADATA RECOVERY ---');

  const { data: seriesList, error } = await supabase
    .from('series')
    .select('id, title, slug, cover_url, cover_image_url, description, status')
    .order('created_at', { ascending: false });

  if (error || !seriesList) {
    console.error('[DB Error]:', error?.message);
    return;
  }

  // Filter to explicitly isolate series with broken covers or bios
  const damagedSeries = seriesList.filter((s) => {
    const cover = s.cover_image_url || s.cover_url || '';
    const hasMissingCover =
      !cover ||
      cover.trim() === '' ||
      cover.includes('MISSING') ||
      cover.includes('placeholder') ||
      cover.includes('undefined');
    const hasMissingBio = !s.description || s.description.trim() === '';
    return hasMissingCover || hasMissingBio;
  });

  console.log(`Identified ${damagedSeries.length} series pending recovery out of ${seriesList.length} total.`);
  let updatedCount = 0;

  for (const s of damagedSeries) {
    const candidates = extractSearchCandidates(s.title);
    if (candidates.length === 0) continue;

    console.log(`[RECOVERING] "${candidates[0]}" (Testing ${candidates.length} terms)`);

    let meta = await fetchAniListMetadata(candidates);

    const activeCover = s.cover_image_url || s.cover_url || '';
    const needsCover =
      !activeCover ||
      activeCover.trim() === '' ||
      activeCover.includes('MISSING') ||
      activeCover.includes('placeholder') ||
      activeCover.includes('undefined');

    const needsBio = !s.description || s.description.trim() === '';

    if (!meta || (needsCover && !meta.coverUrl) || (needsBio && !meta.description)) {
      const mdMeta = await fetchMangaDexMetadata(candidates);
      if (mdMeta) {
        meta = {
          coverUrl: meta?.coverUrl || mdMeta.coverUrl,
          description: meta?.description || mdMeta.description,
          status: meta?.status || mdMeta.status,
        };
      }
    }

    const updatePayload = {};

    if (meta?.coverUrl && needsCover) {
      updatePayload.cover_url = meta.coverUrl;
      updatePayload.cover_image_url = meta.coverUrl;
    }

    if (meta?.description && needsBio) {
      updatePayload.description = meta.description;
    }

    if (!s.status && meta?.status) {
      updatePayload.status = meta.status;
    }

    // Safe slug validation
    const expectedSlug = generateSlug(s.title);
    if (expectedSlug && s.slug !== expectedSlug) {
      const { data: existingSlug } = await supabase
        .from('series')
        .select('id')
        .eq('slug', expectedSlug)
        .neq('id', s.id)
        .maybeSingle();

      if (!existingSlug) {
        updatePayload.slug = expectedSlug;
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      updatePayload.updated_at = new Date().toISOString();

      const { error: updateErr } = await supabase
        .from('series')
        .update(updatePayload)
        .eq('id', s.id);

      if (!updateErr) {
        console.log(`   ✓ [RECOVERED] ${Object.keys(updatePayload).join(', ')}`);
        updatedCount++;
      } else {
        console.error(`   ✗ [UPDATE FAIL]`, updateErr.message);
      }
    } else {
      console.log(`   - [SKIP] No upstream match.`);
    }

    await delay(350);
  }

  console.log(`--- FINISHED: Recovered ${updatedCount} series covers/metadata ---`);
}

runNormalizationAndRecovery().catch(console.error);
