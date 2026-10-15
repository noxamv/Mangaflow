import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Fatal: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { createClient: () => null },
});

const BATCH_SIZE = 15;
const MAX_CHAPTERS_PER_SERIES = 30; // 30 per pass prevents runner execution timeouts
const MANGADEX_API = 'https://api.mangadex.org';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setGithubOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) {
    try {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    } catch (e) {
      console.warn('Failed to write to GITHUB_OUTPUT:', e.message);
    }
  }
}

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
        console.warn(`[429 Rate Limit] Backing off 3.5s on ${url}`);
        await delay(3500);
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await delay(1200 * attempt);
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

    let coverUrl = null;
    const coverRels = manga.relationships?.filter((r) => r.type === 'cover_art') || [];
    if (coverRels.length > 0) {
      const bestCover = coverRels[coverRels.length - 1];
      const fileName = bestCover.attributes?.fileName;
      if (fileName) {
        coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${fileName}`;
      }
    }

    return { mangaId, coverUrl, description: desc };
  } catch (err) {
    console.error(`Error resolving "${title}":`, err.message);
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
    console.warn(`Could not load panels for chapter ${chapterId}:`, err.message);
    return [];
  }
}

async function syncBatch() {
  console.log(`Pulling batch of ${BATCH_SIZE} series with oldest timestamps...`);

  const { data: seriesList, error: sErr } = await supabase
    .from('series')
    .select('id, title, slug, cover_url, description, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (sErr || !seriesList || seriesList.length === 0) {
    console.error('No series queued for sync:', sErr?.message);
    setGithubOutput('has_more', 'false');
    return;
  }

  let totalInsertedAcrossBatch = 0;

  for (const s of seriesList) {
    console.log(`\n========================================`);
    console.log(`Syncing: "${s.title}"`);
    console.log(`========================================`);

    try {
      const mdData = await findMangaDexSeries(s.title);
      await delay(350);

      if (!mdData?.mangaId) {
        console.warn(`[Skip] No match on MangaDex for "${s.title}". Updating timestamp.`);
        await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
        continue;
      }

      // Metadata & cover update
      const updatePayload = {};
      const needsCover = !s.cover_url || 
        s.cover_url.includes('placeholder') || 
        s.cover_url.includes('mangadex.org/covers/null');

      if (mdData.coverUrl && needsCover) updatePayload.cover_url = mdData.coverUrl;
      if (mdData.description && !s.description) updatePayload.description = mdData.description;

      if (Object.keys(updatePayload).length > 0) {
        await supabase.from('series').update(updatePayload).eq('id', s.id);
        console.log(`Updated cover/metadata for "${s.title}"`);
      }

      // Fetch existing chapters and verify which already have images loaded
      const { data: existingChapters } = await supabase
        .from('chapters')
        .select('id, chapter_number, pages')
        .eq('series_id', s.id);

      // Track chapters that already have a non-empty pages array
      const completedSet = new Set(
        (existingChapters || [])
          .filter((c) => Array.isArray(c.pages) && c.pages.length > 0)
          .map((c) => String(c.chapter_number))
      );

      console.log(`Chapters with images in DB: ${completedSet.size} / ${(existingChapters || []).length}`);

      // Safe limit of 100 per request
      const feedUrl = `${MANGADEX_API}/manga/${mdData.mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=100`;
      const feedRes = await fetchJsonWithRetry(feedUrl);
      await delay(350);

      const available = feedRes?.data || [];
      let seriesInserted = 0;

      for (const ch of available) {
        if (seriesInserted >= MAX_CHAPTERS_PER_SERIES) break;

        const rawChNum = ch.attributes?.chapter;
        let parsedNum;

        if (rawChNum !== null && rawChNum !== undefined && !isNaN(parseFloat(rawChNum))) {
          parsedNum = parseFloat(rawChNum);
        } else if (ch.attributes?.title?.toLowerCase().includes('oneshot')) {
          parsedNum = 1;
        } else {
          parsedNum = 1;
        }

        // Only skip if panels are already loaded in database
        if (completedSet.has(String(parsedNum))) continue;

        const chapterId = ch.id;
        const chapterTitle = ch.attributes?.title || `Chapter ${parsedNum}`;
        const pages = await fetchChapterPages(chapterId);
        await delay(350);

        if (pages.length === 0) continue;

        // Upsert allows updating the empty pages column on existing chapter rows
        const { error: insErr } = await supabase.from('chapters').upsert(
          {
            series_id: s.id,
            chapter_number: parsedNum,
            title: chapterTitle,
            pages: pages,
          },
          { onConflict: 'series_id,chapter_number' }
        );

        if (!insErr) {
          completedSet.add(String(parsedNum));
          seriesInserted++;
          totalInsertedAcrossBatch++;
          console.log(`+ Synced panels for Ch. ${parsedNum} (${pages.length} pages)`);
        } else {
          console.warn(`Could not sync Ch. ${parsedNum}:`, insErr.message);
        }
      }

      console.log(`Finished "${s.title}": +${seriesInserted} chapters.`);
    } catch (seriesError) {
      console.error(`Error processing "${s.title}":`, seriesError.message);
    } finally {
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
    }
  }

  const { count: remainingUnsynced } = await supabase
    .from('series')
    .select('id', { count: 'exact', head: true })
    .lte('updated_at', '2001-01-01T00:00:00Z');

  console.log(`\n========================================`);
  console.log(`Batch Summary: Chapters updated/added = ${totalInsertedAcrossBatch}`);
  console.log(`Backlog series remaining = ${remainingUnsynced || 0}`);
  console.log(`========================================`);

  const hasMore = (totalInsertedAcrossBatch > 0 || (remainingUnsynced && remainingUnsynced > 0)) ? 'true' : 'false';
  setGithubOutput('has_more', hasMore);
}

syncBatch().catch((err) => {
  console.error('Fatal sync failure:', err);
  setGithubOutput('has_more', 'false');
  process.exit(1);
});
