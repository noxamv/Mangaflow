// scripts/normalize-titles.js
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[FATAL] Missing Supabase credentials.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket }
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Generate slug safely
function generateSlug(title) {
  const primary = (title || '').split(/[\n\r]/)[0];
  return primary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Extract distinct candidate search strings from dirty multi-line titles
function extractSearchCandidates(rawTitle) {
  if (!rawTitle) return [];
  const lines = rawTitle
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const candidates = new Set();

  for (const line of lines) {
    // 1. Raw line without extra whitespace
    const cleanedLine = line
      .replace(/["“”'']/g, '')
      .replace(/@comic/gi, '')
      .replace(/~.*?~/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanedLine.length > 1) {
      candidates.add(cleanedLine);

      // 2. Subtitle split by colon, dash, or pipe
      const mainSegment = cleanedLine.split(/[:\-\|]/)[0].trim();
      if (mainSegment.length > 2 && mainSegment !== cleanedLine) {
        candidates.add(mainSegment);
      }

      // 3. Strip parentheses content
      const noParens = cleanedLine.replace(/\(.*?\)|\[.*?\]/g, '').trim();
      if (noParens.length > 2) {
        candidates.add(noParens);
      }
    }
  }

  return Array.from(candidates);
}

// 1. Primary Metadata Fetcher: AniList GraphQL
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
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query, variables: { search: term } })
      });

      if (res.status === 429) {
        await delay(1500);
        continue;
      }
      if (!res.ok) continue;

      const json = await res.json();
      const media = json?.data?.Media;
      if (media && (media.coverImage?.extraLarge || media.coverImage?.large || media.description)) {
        return {
          coverUrl: media.coverImage?.extraLarge || media.coverImage?.large || null,
          description: media.description ? media.description.replace(/<[^>]*>?/gm, '').trim() : null,
          status: media.status === 'FINISHED' ? 'Completed' : 'Ongoing'
        };
      }
    } catch {
      // Continue to next candidate on network hiccup
    }
    await delay(350);
  }
  return null;
}

// 2. Secondary Fallback Fetcher: MangaDex API
async function fetchMangaDexMetadata(candidates) {
  for (const term of candidates) {
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
      const description = attributes.description?.en || Object.values(attributes.description || {})[0] || null;

      // Extract cover relationship
      let coverUrl = null;
      const coverRel = manga.relationships?.find((r) => r.type === 'cover_art');
      if (coverRel && coverRel.attributes?.fileName) {
        coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${coverRel.attributes.fileName}.512.jpg`;
      }

      if (coverUrl || description) {
        return {
          coverUrl,
          description: description ? description.replace(/<[^>]*>?/gm, '').trim() : null,
          status: attributes.status === 'completed' ? 'Completed' : 'Ongoing'
        };
      }
    } catch {
      // Continue to next candidate
    }
    await delay(350);
  }
  return null;
}

async function runNormalizationAndRecovery() {
  console.log('--- STARTING MULTI-ENGINE CATALOG RECOVERY ---');

  const { data: seriesList, error } = await supabase
    .from('series')
    .select('id, title, slug, cover_url, cover_image_url, description, status')
    .order('created_at', { ascending: false });

  if (error || !seriesList) {
    console.error('[DB Error]:', error?.message);
    return;
  }

  console.log(`Auditing and normalizing ${seriesList.length} series...`);
  let updatedCount = 0;

  for (const s of seriesList) {
    let needsUpdate = false;
    const updatePayload = {};

    // 1. Normalize Title format and Slugs
    const expectedSlug = generateSlug(s.title);
    if (s.slug !== expectedSlug) {
      updatePayload.slug = expectedSlug;
      needsUpdate = true;
    }

    // 2. Identify missing metadata
    const activeCover = s.cover_image_url || s.cover_url || '';
    const hasMissingCover = !activeCover || activeCover.trim() === '' || activeCover.includes('MISSING') || activeCover.includes('placeholder');
    const hasMissingBio = !s.description || s.description.trim() === '';

    if (hasMissingCover || hasMissingBio) {
      const candidates = extractSearchCandidates(s.title);
      console.log(`[RECOVERING] "${candidates[0]}" (IDs to test: ${candidates.length})`);

      // Attempt AniList first
      let meta = await fetchAniListMetadata(candidates);

      // Attempt MangaDex fallback if AniList did not provide all needed fields
      if (!meta || (hasMissingCover && !meta.coverUrl) || (hasMissingBio && !meta.description)) {
        const mdMeta = await fetchMangaDexMetadata(candidates);
        if (mdMeta) {
          meta = {
            coverUrl: meta?.coverUrl || mdMeta.coverUrl,
            description: meta?.description || mdMeta.description,
            status: meta?.status || mdMeta.status
          };
        }
      }

      if (meta) {
        if (hasMissingCover && meta.coverUrl) {
          updatePayload.cover_url = meta.coverUrl;
          updatePayload.cover_image_url = meta.coverUrl;
          needsUpdate = true;
        }
        if (hasMissingBio && meta.description) {
          updatePayload.description = meta.description;
          needsUpdate = true;
        }
        if (!s.status && meta.status) {
          updatePayload.status = meta.status;
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate && Object.keys(updatePayload).length > 0) {
      const { error: updateErr } = await supabase
        .from('series')
        .update(updatePayload)
        .eq('id', s.id);

      if (!updateErr) {
        console.log(`   [UPDATED] ID: ${s.id} -> Recovered: ${Object.keys(updatePayload).join(', ')}`);
        updatedCount++;
      } else {
        console.error(`   [UPDATE FAIL] ID: ${s.id}`, updateErr.message);
      }
    }
  }

  console.log(`--- FINISHED: Updated and recovered ${updatedCount} series ---`);
}

runNormalizationAndRecovery().catch(console.error);
