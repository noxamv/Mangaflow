import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// Disable auth session persistence and realtime websockets for CLI scraper runners
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { createClient: () => null },
});

const BATCH_SIZE = 25;
const MAX_NEW_CHAPTERS_PER_SERIES = 10;
const MANGADEX_API = 'https://api.mangadex.org';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJsonWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'MangaFlow/2.0 (aggregator-sync)',
          ...(options.headers || {}),
        },
      });

      if (res.status === 429) {
        console.warn(`[Rate Limited 429] Waiting 3s on ${url}`);
        await delay(3000);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await delay(1500 * attempt);
    }
  }
}

async function findMangaDexSeries(title) {
  try {
    const cleanTitle = title.replace(/[^\w\s]/gi, ' ').trim();
    const queryUrl = `${MANGADEX_API}/manga?title=${encodeURIComponent(cleanTitle)}&limit=1&includes[]=cover_art`;
    const res = await fetchJsonWithRetry(queryUrl);

    if (!res.data || res.data.length === 0) return null;

    const manga = res.data[0];
    const mangaId = manga.id;
    const desc = manga.attributes?.description?.en || '';

    let coverUrl = null;
    const coverRel = manga.relationships?.find((r) => r.type === 'cover_art');
    if (coverRel?.attributes?.fileName) {
      coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${coverRel.attributes.fileName}`;
    }

    return { mangaId, coverUrl, description: desc };
  } catch (err) {
    console.error(`Error resolving MangaDex ID for "${title}":`, err.message);
    return null;
  }
}

async function fetchChapterPages(chapterId) {
  try {
    const res = await fetchJsonWithRetry(`${MANGADEX_API}/at-home/server/${chapterId}`);
    const host = res.baseUrl;
    const hash = res.chapter.hash;
    const files = res.chapter.data || [];

    return files.map((fileName) => `${host}/data/${hash}/${fileName}`);
  } catch (err) {
    console.error(`Failed to fetch pages for chapter ${chapterId}:`, err.message);
    return [];
  }
}

async function syncBatch() {
  console.log(`Starting sync batch of ${BATCH_SIZE} series...`);

  const { data: seriesList, error: sErr } = await supabase
    .from('series')
    .select('id, title, slug, cover_url, description, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (sErr || !seriesList || seriesList.length === 0) {
    console.error('Failed to load series batch or table is empty:', sErr);
    setGithubOutput('has_more', 'false');
    return;
  }

  let totalInsertedAcrossBatch = 0;

  for (const s of seriesList) {
    console.log(`\n--- [Series: "${s.title}"] ---`);

    const mdData = await findMangaDexSeries(s.title);
    await delay(350);

    if (!mdData?.mangaId) {
      console.warn(`Could not match "${s.title}" on MangaDex. Skipping.`);
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    const updatePayload = {};
    if (!s.cover_url || s.cover_url.includes('placeholder')) {
      if (mdData.coverUrl) updatePayload.cover_url = mdData.coverUrl;
    }
    if (!s.description && mdData.description) {
      updatePayload.description = mdData.description;
    }

    if (Object.keys(updatePayload).length > 0) {
      await supabase.from('series').update(updatePayload).eq('id', s.id);
      console.log(`Updated cover/description for "${s.title}".`);
    }

    const { data: existingChapters } = await supabase
      .from('chapters')
      .select('chapter_number')
      .eq('series_id', s.id);

    const existingSet = new Set((existingChapters || []).map((c) => String(c.chapter_number)));

    const feedUrl = `${MANGADEX_API}/manga/${mdData.mangaId}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=100`;
    let feedRes;
    try {
      feedRes = await fetchJsonWithRetry(feedUrl);
      await delay(350);
    } catch {
      console.warn(`Could not pull feed for "${s.title}".`);
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    const availableChapters = feedRes?.data || [];
    let seriesInserted = 0;

    for (const ch of availableChapters) {
      if (seriesInserted >= MAX_NEW_CHAPTERS_PER_SERIES) break;

      const chNum = ch.attributes?.chapter;
      if (!chNum || existingSet.has(String(chNum))) continue;

      const chapterId = ch.id;
      const chapterTitle = ch.attributes?.title || `Chapter ${chNum}`;
      const pages = await fetchChapterPages(chapterId);
      await delay(350);

      if (pages.length === 0) continue;

      const { error: insErr } = await supabase.from('chapters').insert({
        series_id: s.id,
        chapter_number: parseFloat(chNum),
        title: chapterTitle,
        pages: pages,
      });

      if (!insErr) {
        existingSet.add(String(chNum));
        seriesInserted++;
        totalInsertedAcrossBatch++;
        console.log(`Inserted Ch. ${chNum} (${pages.length} panels) for "${s.title}"`);
      }
    }

    await supabase
      .from('series')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', s.id);

    console.log(`Finished "${s.title}": added ${seriesInserted} new chapters.`);
  }

  console.log(`\n========================================`);
  console.log(`Batch complete. Total new chapters inserted: ${totalInsertedAcrossBatch}`);
  console.log(`========================================`);

  const hasMore = totalInsertedAcrossBatch > 0 ? 'true' : 'false';
  setGithubOutput('has_more', hasMore);
}

function setGithubOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

syncBatch().catch((err) => {
  console.error('Fatal sync error:', err);
  process.exit(1);
});
