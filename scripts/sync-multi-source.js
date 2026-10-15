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

const BATCH_SIZE = 20;
const MAX_CHAPTERS_PER_SERIES = 300;
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

async function fetchJsonWithRetry(url, options = {}, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'MangaFlow/3.0 (universal-sync-and-repair)',
          ...(options.headers || {}),
        },
      });

      if (res.status === 429) {
        console.warn(`[429 Rate Limit] Backing off ${attempt * 3}s on ${url}`);
        await delay(3000 * attempt);
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) return null;
      await delay(1200 * attempt);
    }
  }
  return null;
}

async function isImageAlive(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'MangaFlow/3.0' },
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
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

    if ((!res?.data || res.data.length === 0) && title.includes(' - ')) {
      const simplified = title.split(' - ')[0].trim();
      queryUrl = `${MANGADEX_API}/manga?title=${encodeURIComponent(simplified)}&limit=5&includes[]=cover_art`;
      res = await fetchJsonWithRetry(queryUrl);
    }

    if (!res?.data || res.data.length === 0) return null;

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
    console.error(`Error searching MangaDex for "${title}":`, err.message);
    return null;
  }
}

async function fetchChapterPages(chapterId) {
  try {
    const res = await fetchJsonWithRetry(`${MANGADEX_API}/at-home/server/${chapterId}`);
    if (!res?.baseUrl || !res?.chapter?.hash) return [];
    const host = res.baseUrl;
    const hash = res.chapter.hash;
    const files = res.chapter.data || [];
    return files.map((f) => `${host}/data/${hash}/${f}`);
  } catch {
    return [];
  }
}

// 1. REPAIR MALFORMED TITLES
async function repairMalformedTitles() {
  console.log('\n--- Auditing & Repairing Malformed Chapter Titles ---');
  const { data: badChapters } = await supabase
    .from('chapters')
    .select('id, chapter_number, title')
    .or('title.ilike.%null%,title.is.null,title.eq.""');

  if (badChapters && badChapters.length > 0) {
    for (const ch of badChapters) {
      const fallback = ch.chapter_number === 0 ? 'Prologue' : `Chapter ${ch.chapter_number}`;
      await supabase.from('chapters').update({ title: fallback }).eq('id', ch.id);
      console.log(`Repaired Ch. ${ch.chapter_number} title -> "${fallback}"`);
    }
  } else {
    console.log('✓ All chapter titles are clean.');
  }
}

// 2. UNIFIED COVER REPAIR & CHAPTER PANEL SYNC
async function runUnifiedSyncAndRepair() {
  await repairMalformedTitles();

  console.log(`\nPulling batch of ${BATCH_SIZE} series with oldest timestamps...`);
  const { data: seriesList, error: sErr } = await supabase
    .from('series')
    .select('id, title, slug, cover_url, description, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (sErr || !seriesList || seriesList.length === 0) {
    console.log('No series queued for sync.');
    setGithubOutput('has_more', 'false');
    return;
  }

  let totalUpdatedAcrossBatch = 0;

  for (const s of seriesList) {
    console.log(`\n==================================================`);
    console.log(`Processing: "${s.title}"`);
    console.log(`==================================================`);

    try {
      const mdData = await findMangaDexSeries(s.title);
      await delay(300);

      if (!mdData?.mangaId) {
        console.warn(`[Skip] "${s.title}" not found on MangaDex. Updating timestamp.`);
        await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
        continue;
      }

      // Check & repair broken, missing, or 404 covers
      let needsCoverRepair = false;
      if (!s.cover_url || s.cover_url.trim() === '' || !s.cover_url.startsWith('http') || s.cover_url.includes('placeholder')) {
        needsCoverRepair = true;
      } else {
        const alive = await isImageAlive(s.cover_url);
        if (!alive) needsCoverRepair = true;
      }

      const metaUpdates = {};
      if (needsCoverRepair && mdData.coverUrl) {
        metaUpdates.cover_url = mdData.coverUrl;
        console.log(`✓ Repaired cover URL for "${s.title}"`);
      }
      if ((!s.description || s.description.trim() === '') && mdData.description) {
        metaUpdates.description = mdData.description;
        console.log(`✓ Repaired missing description for "${s.title}"`);
      }

      if (Object.keys(metaUpdates).length > 0) {
        await supabase.from('series').update(metaUpdates).eq('id', s.id);
      }

      // Fetch all chapters currently in database for this title
      const { data: existingChapters } = await supabase
        .from('chapters')
        .select('id, chapter_number, pages')
        .eq('series_id', s.id);

      // Track chapters that already have comic page images populated
      const completedSet = new Set(
        (existingChapters || [])
          .filter((c) => Array.isArray(c.pages) && c.pages.length > 0)
          .map((c) => String(c.chapter_number))
      );

      console.log(`Panels Status: ${completedSet.size} / ${(existingChapters || []).length} chapters populated with images.`);

      // Pull up to 500 chapters from MangaDex
      const feedUrl = `${MANGADEX_API}/manga/${mdData.mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=500`;
      const feedRes = await fetchJsonWithRetry(feedUrl);
      await delay(300);

      const available = feedRes?.data || [];
      let seriesUpdatedCount = 0;

      for (const ch of available) {
        if (seriesUpdatedCount >= MAX_CHAPTERS_PER_SERIES) {
          console.log(`Reached per-series limit of ${MAX_CHAPTERS_PER_SERIES} chapters.`);
          break;
        }

        const rawChNum = ch.attributes?.chapter;
        let parsedNum;

        if (rawChNum !== null && rawChNum !== undefined && !isNaN(parseFloat(rawChNum))) {
          parsedNum = parseFloat(rawChNum);
        } else if (ch.attributes?.title?.toLowerCase().includes('oneshot')) {
          parsedNum = 1;
        } else {
          parsedNum = 1;
        }

        // Skip only if the chapter already has image panels stored
        if (completedSet.has(String(parsedNum))) continue;

        const chapterId = ch.id;
        const chapterTitle = ch.attributes?.title || `Chapter ${parsedNum}`;
        const pages = await fetchChapterPages(chapterId);
        await delay(300);

        if (!pages || pages.length === 0) continue;

        // Upsert writes panel URLs directly to chapters.pages
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
          seriesUpdatedCount++;
          totalUpdatedAcrossBatch++;
          console.log(`✓ Ch. ${parsedNum}: Synced ${pages.length} panels`);
        } else {
          console.warn(`Could not sync Ch. ${parsedNum}:`, insErr.message);
        }
      }

      console.log(`Finished "${s.title}": Synced ${seriesUpdatedCount} chapters with images.`);
    } catch (seriesErr) {
      console.error(`Error on "${s.title}":`, seriesErr.message);
    } finally {
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
    }
  }

  const { count: remainingUnsynced } = await supabase
    .from('series')
    .select('id', { count: 'exact', head: true })
    .lte('updated_at', '2001-01-01T00:00:00Z');

  console.log(`\n==================================================`);
  console.log(`Run Complete: Total chapters with panels synced = ${totalUpdatedAcrossBatch}`);
  console.log(`Backlog series remaining for pass = ${remainingUnsynced || 0}`);
  console.log(`==================================================`);

  const hasMore = (totalUpdatedAcrossBatch > 0 || (remainingUnsynced && remainingUnsynced > 0)) ? 'true' : 'false';
  setGithubOutput('has_more', hasMore);
}

runUnifiedSyncAndRepair().catch((err) => {
  console.error('Fatal execution failure:', err);
  setGithubOutput('has_more', 'false');
  process.exit(1);
});
