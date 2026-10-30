// scripts/normalize-titles.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[FATAL] Missing Supabase credentials.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Advanced title cleaner: handles Romaji separators, alternative titles, and special chars
function cleanTitleForSearch(titleStr) {
  if (!titleStr) return '';
  let cleaned = titleStr
    // Take only the first primary title if multiple are joined by newlines or weird separators
    .split(/[\n\r]|[\t]|(?:\s*-\s*){2,}|(?:\s*\|\s*)/)[0]
    // Remove parentheses/bracket content like alternative titles
    .replace(/\s*[\(\[].*?[\)\]]/g, '')
    // Remove special symbols
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

function generateSlug(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchAniListMetadata(title) {
  const searchQuery = cleanTitleForSearch(title);
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
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables: { search: searchQuery } })
    });
    if (!res.ok) return null;
    const json = await res.json();
    const media = json?.data?.Media;
    if (!media) return null;

    return {
      englishTitle: media.title?.english || media.title?.romaji || title,
      description: media.description || null,
      coverUrl: media.coverImage?.extraLarge || media.coverImage?.large || null,
      status: media.status === 'FINISHED' ? 'Completed' : 'Ongoing'
    };
  } catch {
    return null;
  }
}

async function runNormalizationAndRecovery() {
  console.log('--- STARTING CATALOG NORMALIZATION & RECOVERY ---');

  const { data: seriesList, error } = await supabase
    .from('series')
    .select('id, title, slug, cover_url, description')
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

    // 1. Normalize Slug & Title formatting
    const cleanTitle = (s.title || '').trim();
    const expectedSlug = generateSlug(cleanTitle);
    if (s.slug !== expectedSlug) {
      updatePayload.slug = expectedSlug;
      needsUpdate = true;
    }

    // 2. Recover Missing Covers or Bios via AniList (handling Romaji/multilingual fallback)
    const hasMissingCover = !s.cover_url || s.cover_url.includes('MISSING') || s.cover_url.includes('placeholder');
    const hasMissingBio = !s.description || s.description.trim() === '';

    if (hasMissingCover || hasMissingBio) {
      console.log(`[RECOVERING] Fetching metadata for: "${cleanTitle}"`);
      const meta = await fetchAniListMetadata(cleanTitle);

      if (meta) {
        if (hasMissingCover && meta.coverUrl) {
          updatePayload.cover_url = meta.coverUrl;
          needsUpdate = true;
        }
        if (hasMissingBio && meta.description) {
          updatePayload.description = meta.description;
          needsUpdate = true;
        }
      }
      await delay(600); // Respect AniList rate limit
    }

    if (needsUpdate && Object.keys(updatePayload).length > 0) {
      const { error: updateErr } = await supabase
        .from('series')
        .update(updatePayload)
        .eq('id', s.id);

      if (!updateErr) {
        console.log(`   [UPDATED] Series ID ${s.id} normalized & repaired.`);
        updatedCount++;
      }
    }
  }

  console.log(`--- NORMALIZATION & RECOVERY COMPLETE: Updated ${updatedCount} series ---`);
}

runNormalizationAndRecovery().catch(console.error);
