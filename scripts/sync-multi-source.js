import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { createClient: () => null },
});

const BATCH_SIZE = 15;
// Increased to backfill all backlog chapters without capping at 10
const MAX_CHAPTERS_PER_SERIES = 60;
const MANGADEX_API = 'https://api.mangadex.org';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJsonWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'MangaFlow/2.0 (production-sync)',
          ...(options.headers || {}),
        },
      });

      if (res.status === 429) {
        console.warn(`[429 Rate Limit] Waiting 3.5s on ${url}`);
        await delay(3500);
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await delay(1500 * attempt);
    }
  }
}

async function findMangaDexSeries(title) {
  try {
    const cleanTitle = title
      .replace(/\[.*?\]|\(.*?\)/g, '')
      .replace(/[^\w\s]/gi, ' ')
      .trim();

    let queryUrl = `${MANGADEX_API}/manga?title=${encodeURIComponent(cleanTitle)}&limit=5&includes[]=cover_art`;
    let res = await fetchJsonWithRetry(queryUrl);

    if ((!res.data || res.data.length === 0) && title.includes(' - ')) {
      const simplified = title.split(' - ')[0].trim();
      queryUrl = `${MANGADEX_API}/manga?title=${encodeURIComponent(simplified)}&limit=5&includes[]=cover_art`;
      res = await fetchJsonWithRetry(queryUrl);
    }

    if (!res.data || res.data.length === 0) return null;

    const manga = res.data[0];
    const mangaId = manga.id;
    const desc = manga.attributes?.description?.en || '';

    // Prefer official English title if current title is raw romanized
    const enTitle = manga.attributes?.altTitles?.find((t) => t.en)?.en || manga.attributes?.title?.en;

    // Grab the best available cover art file
    let coverUrl = null;
    const coverRels = manga.relationships?.filter((r) => r.type === 'cover_art') || [];
    if (coverRels.length > 0) {
      const bestCover = coverRels[coverRels.length - 1];
      const fileName = bestCover.attributes?.fileName;
      if (fileName) {
        coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${fileName}`;
      }
    }

    return { mangaId, coverUrl, description: desc, enTitle };
  } catch (err) {
    console.error(`Error resolving MangaDex metadata for "${title}":`, err.message);
    return null;
  }
}

async function fetchChapterPages(chapterId) {
  try {
    const res = await fetchJsonWithRetry(`${MANGADEX_API}/at-home/server/${chapterId}`);
    const host = res.baseUrl;
    const hash = res.chapter.hash;
    const files = res.chapter.data || [];
    return files.map((f) => `${host}/data/${hash}/${f}`);
  } catch (err) {
    console.error(`Failed to load panels for chapter ${chapterId}:`, err.message);
    return [];
  }
}

async function syncBatch() {
  console.log(`Starting deep backfill batch of ${BATCH_SIZE} series...`);

  const { data: seriesList, error: sErr } = await supabase
    .from('series')
    .select('id, title, slug, cover_url, description, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (sErr || !seriesList || seriesList.length === 0) {
    console.error('No series queued for backfill:', sErr);
    setGithubOutput('has_more', 'false');
    return;
  }

  let totalInsertedAcrossBatch = 0;

  for (const s of seriesList) {
    console.log(`\n========================================`);
    console.log(`Processing: "${s.title}"`);
    console.log(`========================================`);

    const mdData = await findMangaDexSeries(s.title);
    await delay(350);

    if (!mdData?.mangaId) {
      console.warn(`No match found on MangaDex for "${s.title}".`);
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    // Refresh cover art, description, and title
    const updatePayload = {};
    if (mdData.coverUrl && (!s.cover_url || s.cover_url.includes('placeholder') || s.cover_url.includes('mangadex.org/covers/null'))) {
      updatePayload.cover_url = mdData.coverUrl;
    }
    if (mdData.description && !s.description) {
      updatePayload.description = mdData.description;
    }

    if (Object.keys(updatePayload).length > 0) {
      await supabase.from('series').update(updatePayload).eq('id', s.id);
      console.log(`Updated metadata and cover image for "${s.title}"`);
    }

    // Load existing chapters in database
    const { data: existingChapters } = await supabase
      .from('chapters')
      .select('chapter_number')
      .eq('series_id', s.id);

    const existingSet = new Set((existingChapters || []).map((c) => String(c.chapter_number)));
    console.log(`Current chapters in database: ${existingSet.size}`);

    // Query all available English chapters up to limit 500
    const feedUrl = `${MANGADEX_API}/manga/${mdData.mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=500`;
    let feedRes;
    try {
      feedRes = await fetchJsonWithRetry(feedUrl);
      await delay(350);
    } catch {
      console.warn(`Failed to pull feed for "${s.title}".`);
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    const available = feedRes?.data || [];
    let seriesInserted = 0;

    for (const ch of available) {
      if (seriesInserted >= MAX_CHAPTERS_PER_SERIES) break;

      const chNum = ch.attributes?.chapter || (ch.attributes?.title?.toLowerCase().includes('oneshot') ? '1' : null) || '1';
      if (existingSet.has(String(chNum))) continue;

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
        console.log(`+ Inserted Ch. ${chNum} (${pages.length} panels)`);
      }
    }

    await supabase
      .from('series')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', s.id);

    console.log(`Completed "${s.title}": added ${seriesInserted} chapters.`);
  }

  console.log(`\n========================================`);
  console.log(`Batch finished. New chapters inserted: ${totalInsertedAcrossBatch}`);
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
  console.error('Fatal batch sync error:', err);
  process.exit(1);
});
