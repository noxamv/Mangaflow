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

const MANGADEX_API = 'https://api.mangadex.org';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJsonWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'MangaFlow/3.0 (catalog-repair-engine)',
          ...(options.headers || {}),
        },
      });

      if (res.status === 429) {
        console.warn(`[429 Rate Limit] MangaDex backoff on ${url}. Waiting ${attempt * 3}s...`);
        await delay(3000 * attempt);
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) return null;
      await delay(1000 * attempt);
    }
  }
  return null;
}

// Check if an image URL actually loads (not broken / 404)
async function isImageAlive(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
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
    console.error(`Error resolving MangaDex title "${title}":`, err.message);
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

// ==========================================
// 1. REPAIR MALFORMED METADATA & TITLES
// ==========================================
async function repairMalformedTitles() {
  console.log('\n--- Step 1: Repairing Malformed Chapter Titles ---');
  const { data: badChapters, error } = await supabase
    .from('chapters')
    .select('id, chapter_number, title')
    .or('title.ilike.%null%,title.is.null,title.eq.""');

  if (error) {
    console.warn('Error reading bad titles:', error.message);
    return;
  }

  if (!badChapters || badChapters.length === 0) {
    console.log('✓ All chapter titles are clean.');
    return;
  }

  for (const ch of badChapters) {
    const fallbackTitle = ch.chapter_number === 0 ? 'Prologue' : `Chapter ${ch.chapter_number}`;
    await supabase.from('chapters').update({ title: fallbackTitle }).eq('id', ch.id);
    console.log(`Repaired Ch. ${ch.chapter_number}: Title set to "${fallbackTitle}"`);
  }
}

// ==========================================
// 2. REPAIR BROKEN OR MISSING COVERS
// ==========================================
async function repairCovers() {
  console.log('\n--- Step 2: Auditing Series Covers ---');
  const { data: seriesList } = await supabase
    .from('series')
    .select('id, title, cover_url, description');

  if (!seriesList || seriesList.length === 0) return;

  for (const s of seriesList) {
    let needsCoverFix = false;

    if (!s.cover_url || s.cover_url.trim() === '' || !s.cover_url.startsWith('http')) {
      needsCoverFix = true;
    } else if (
      s.cover_url.includes('placeholder') ||
      s.cover_url.includes('mangadex.org/covers/null')
    ) {
      needsCoverFix = true;
    } else {
      // Test if cover link is a dead 404
      const alive = await isImageAlive(s.cover_url);
      if (!alive) {
        console.warn(`Cover 404 dead link detected for "${s.title}": ${s.cover_url}`);
        needsCoverFix = true;
      }
    }

    if (needsCoverFix) {
      console.log(`Repairing cover for: "${s.title}"...`);
      const mdData = await findMangaDexSeries(s.title);
      await delay(350);

      const updateData = {};
      if (mdData?.coverUrl) updateData.cover_url = mdData.coverUrl;
      if (mdData?.description && (!s.description || s.description.trim() === '')) {
        updateData.description = mdData.description;
      }

      if (Object.keys(updateData).length > 0) {
        await supabase.from('series').update(updateData).eq('id', s.id);
        console.log(`✓ Repaired cover/description for "${s.title}"`);
      } else {
        console.warn(`Could not find replacement cover for "${s.title}"`);
      }
    }
  }
}

// ==========================================
// 3. REPAIR BROKEN OR EMPTY CHAPTER IMAGES
// ==========================================
async function repairChapterImages() {
  console.log('\n--- Step 3: Auditing & Repairing Chapter Panels ---');
  
  // Find series that have chapters with empty/broken pages
  const { data: allSeries } = await supabase
    .from('series')
    .select('id, title')
    .order('updated_at', { ascending: true, nullsFirst: true });

  if (!allSeries || allSeries.length === 0) return;

  for (const s of allSeries) {
    // Look up chapters for this series
    const { data: chapters } = await supabase
      .from('chapters')
      .select('id, chapter_number, pages')
      .eq('series_id', s.id)
      .order('chapter_number', { ascending: true });

    if (!chapters || chapters.length === 0) continue;

    // Filter chapters that have null or empty pages
    const brokenChapters = chapters.filter((c) => {
      if (!c.pages) return true;
      if (Array.isArray(c.pages) && c.pages.length === 0) return true;
      return false;
    });

    if (brokenChapters.length === 0) {
      continue;
    }

    console.log(`\nFound ${brokenChapters.length} empty chapters in "${s.title}". Repairing...`);
    const mdData = await findMangaDexSeries(s.title);
    await delay(350);

    if (!mdData?.mangaId) {
      console.warn(`Cannot repair "${s.title}": Not indexed on MangaDex.`);
      continue;
    }

    // Pull chapter feed from MangaDex
    const feedUrl = `${MANGADEX_API}/manga/${mdData.mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=500`;
    const feedRes = await fetchJsonWithRetry(feedUrl);
    await delay(350);

    const availableFeed = feedRes?.data || [];
    const brokenMap = new Map(brokenChapters.map((bc) => [String(bc.chapter_number), bc.id]));

    let repairedCount = 0;

    for (const feedCh of availableFeed) {
      const rawNum = feedCh.attributes?.chapter;
      if (rawNum === null || rawNum === undefined || isNaN(parseFloat(rawNum))) continue;

      const numStr = String(parseFloat(rawNum));
      if (!brokenMap.has(numStr)) continue;

      const dbChapterId = brokenMap.get(numStr);
      const panels = await fetchChapterPages(feedCh.id);
      await delay(350);

      if (!panels || panels.length === 0) continue;

      // Update the empty chapter row with fresh panels
      const { error: upErr } = await supabase
        .from('chapters')
        .update({ pages: panels })
        .eq('id', dbChapterId);

      if (!upErr) {
        repairedCount++;
        brokenMap.delete(numStr);
        console.log(`✓ Ch. ${numStr}: Repaired with ${panels.length} panels`);
      }
    }

    console.log(`Finished "${s.title}": Repaired ${repairedCount} chapters.`);
  }
}

async function runFullRepair() {
  console.log('==================================================');
  console.log('       STARTING COMPLETE CATALOG HEALTH REPAIR    ');
  console.log('==================================================');

  await repairMalformedTitles();
  await repairCovers();
  await repairChapterImages();

  console.log('\n==================================================');
  console.log('       ALL AUDITS AND REPAIRS COMPLETED           ');
  console.log('==================================================');
}

runFullRepair().catch((err) => {
  console.error('Fatal repair error:', err);
  process.exit(1);
});
