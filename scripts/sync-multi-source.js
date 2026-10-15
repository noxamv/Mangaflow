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

const BATCH_SIZE = 25;
const MAX_CHAPTERS_PER_SERIES = 350;
const MANGADEX_API = 'https://api.mangadex.org';
const COMICK_API = 'https://api.comick.fun';
const CONSUMET_API = 'https://api.consumet.org/manga/mangahere';

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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          ...(options.headers || {}),
        },
      });

      if (res.status === 429) {
        await delay(2500 * attempt);
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

async function isImageAlive(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

function cleanTitle(title) {
  return title
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .trim();
}

async function fetchFromMangaDex(title) {
  try {
    const clean = cleanTitle(title);
    const url = `${MANGADEX_API}/manga?title=${encodeURIComponent(clean)}&limit=5&includes[]=cover_art&includes[]=author`;
    const res = await fetchJsonWithRetry(url);
    if (!res?.data || res.data.length === 0) return null;

    const manga = res.data[0];
    const mangaId = manga.id;
    const desc = manga.attributes?.description?.en || '';

    let coverUrl = null;
    const coverRel = manga.relationships?.find((r) => r.type === 'cover_art');
    if (coverRel?.attributes?.fileName) {
      coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${coverRel.attributes.fileName}`;
    }

    const authorRel = manga.relationships?.find((r) => r.type === 'author');
    const author = authorRel?.attributes?.name || null;

    return { source: 'mangadex', id: mangaId, coverUrl, description: desc, author };
  } catch {
    return null;
  }
}

async function fetchMangaDexPanels(chapterId) {
  try {
    const res = await fetchJsonWithRetry(`${MANGADEX_API}/at-home/server/${chapterId}`);
    if (!res?.baseUrl || !res?.chapter?.hash) return [];
    return (res.chapter.data || []).map((f) => `${res.baseUrl}/data/${res.chapter.hash}/${f}`);
  } catch {
    return [];
  }
}

async function fetchFromComicK(title) {
  try {
    const clean = cleanTitle(title);
    const searchUrl = `${COMICK_API}/v1.0/search?q=${encodeURIComponent(clean)}&limit=3`;
    const res = await fetchJsonWithRetry(searchUrl);
    if (!res || !Array.isArray(res) || res.length === 0) return null;

    const item = res[0];
    const fullInfo = await fetchJsonWithRetry(`${COMICK_API}/comic/${item.slug}`);
    
    let coverUrl = null;
    if (item.md_covers?.[0]?.b2key) {
      coverUrl = `https://meo.comick.pictures/${item.md_covers[0].b2key}`;
    }

    return {
      source: 'comick',
      hid: item.hid,
      slug: item.slug,
      coverUrl,
      description: fullInfo?.comic?.desc || item.desc || '',
      author: fullInfo?.authors?.[0]?.name || item.authors?.[0]?.name || null,
    };
  } catch {
    return null;
  }
}

async function fetchComicKChapters(hid) {
  try {
    const res = await fetchJsonWithRetry(`${COMICK_API}/comic/${hid}/chapters?lang=en&limit=500`);
    if (!res?.chapters) return [];
    return res.chapters.map((c) => ({
      hid: c.hid,
      chapter: c.chap ? parseFloat(c.chap) : 1,
      title: c.title || `Chapter ${c.chap || 1}`,
    }));
  } catch {
    return [];
  }
}

async function fetchComicKPanels(chapterHid) {
  try {
    const res = await fetchJsonWithRetry(`${COMICK_API}/chapter/${chapterHid}`);
    if (!res?.chapter?.images) return [];
    return res.chapter.images
      .filter((img) => img.url || img.b2key)
      .map((img) => (img.url ? img.url : `https://meo.comick.pictures/${img.b2key}`));
  } catch {
    return [];
  }
}

async function fetchFromUnofficialMirrors(title) {
  try {
    const clean = cleanTitle(title);
    const searchRes = await fetchJsonWithRetry(`${CONSUMET_API}/${encodeURIComponent(clean)}`);
    if (!searchRes?.results || searchRes.results.length === 0) return null;

    const item = searchRes.results[0];
    const details = await fetchJsonWithRetry(`${CONSUMET_API}/info?id=${encodeURIComponent(item.id)}`);
    if (!details) return null;

    return {
      source: 'mirror',
      id: details.id,
      coverUrl: details.image || null,
      description: details.description || '',
      author: details.author || null,
      chapters: (details.chapters || []).map((ch, idx) => ({
        id: ch.id,
        chapter: parseFloat(ch.title?.match(/\d+(\.\d+)?/)?.[0] || idx + 1),
        title: ch.title || `Chapter ${idx + 1}`,
      })),
    };
  } catch {
    return null;
  }
}

async function fetchMirrorPanels(chapterId) {
  try {
    const res = await fetchJsonWithRetry(`${CONSUMET_API}/read?chapterId=${encodeURIComponent(chapterId)}`);
    if (!Array.isArray(res)) return [];
    return res.map((item) => item.img).filter(Boolean);
  } catch {
    return [];
  }
}

async function resolveAnySource(title) {
  let data = await fetchFromMangaDex(title);
  if (data?.id) return data;

  data = await fetchFromComicK(title);
  if (data?.hid) return data;

  data = await fetchFromUnofficialMirrors(title);
  if (data?.id) return data;

  return null;
}

async function repairMalformedTitles() {
  const { data: badChapters } = await supabase
    .from('chapters')
    .select('id, chapter_number, title')
    .or('title.ilike.%null%,title.is.null,title.eq.""');

  if (badChapters && badChapters.length > 0) {
    for (const ch of badChapters) {
      const fallback = ch.chapter_number === 0 ? 'Prologue' : `Chapter ${ch.chapter_number}`;
      await supabase.from('chapters').update({ title: fallback }).eq('id', ch.id);
    }
  }
}

async function runUnifiedSync() {
  await repairMalformedTitles();

  // Read schema checking both cover_image_url and cover_url
  const { data: seriesList, error: sErr } = await supabase
    .from('series')
    .select('id, title, slug, cover_image_url, synopsis, author, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (sErr || !seriesList || seriesList.length === 0) {
    console.log('Catalog completely up-to-date.');
    setGithubOutput('has_more', 'false');
    return;
  }

  let totalPanelsPopulated = 0;

  for (const s of seriesList) {
    console.log(`Auditing & Repairing: "${s.title}"`);

    try {
      const resolved = await resolveAnySource(s.title);
      await delay(250);

      if (!resolved) {
        await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
        continue;
      }

      const activeCover = s.cover_image_url;
      const isMissingMeta = 
        !s.synopsis || 
        s.synopsis.trim() === '' || 
        s.synopsis.includes('No description') ||
        !s.author || 
        s.author.toLowerCase() === 'unknown';

      let coverValid = await isImageAlive(activeCover);
      let needsCoverRepair = !coverValid || isMissingMeta || !activeCover || activeCover.includes('placeholder');

      const metaUpdates = {};
      if (needsCoverRepair && resolved.coverUrl) {
        metaUpdates.cover_image_url = resolved.coverUrl;
      }
      if (isMissingMeta && resolved.description) {
        metaUpdates.synopsis = resolved.description;
      }
      if (isMissingMeta && resolved.author) {
        metaUpdates.author = resolved.author;
      }

      if (Object.keys(metaUpdates).length > 0) {
        await supabase.from('series').update(metaUpdates).eq('id', s.id);
      }

      const { data: dbChapters } = await supabase
        .from('chapters')
        .select('id, chapter_number, pages')
        .eq('series_id', s.id);

      const completedSet = new Set();
      for (const ch of dbChapters || []) {
        if (Array.isArray(ch.pages) && ch.pages.length > 0) {
          completedSet.add(String(ch.chapter_number));
        }
      }

      let seriesSyncCount = 0;

      if (resolved.source === 'mangadex') {
        const feed = await fetchJsonWithRetry(
          `${MANGADEX_API}/manga/${resolved.id}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=500`
        );
        for (const item of feed?.data || []) {
          if (seriesSyncCount >= MAX_CHAPTERS_PER_SERIES) break;
          const num = item.attributes?.chapter ? parseFloat(item.attributes.chapter) : 1;
          if (isNaN(num) || completedSet.has(String(num))) continue;

          const pages = await fetchMangaDexPanels(item.id);
          await delay(250);
          if (!pages || pages.length === 0) continue;

          await supabase.from('chapters').upsert({
            series_id: s.id,
            chapter_number: num,
            title: item.attributes?.title || `Chapter ${num}`,
            pages,
          }, { onConflict: 'series_id,chapter_number' });

          completedSet.add(String(num));
          seriesSyncCount++;
          totalPanelsPopulated++;
        }
      } else if (resolved.source === 'comick') {
        const comickChapters = await fetchComicKChapters(resolved.hid);
        for (const item of comickChapters) {
          if (seriesSyncCount >= MAX_CHAPTERS_PER_SERIES) break;
          if (completedSet.has(String(item.chapter))) continue;

          const pages = await fetchComicKPanels(item.hid);
          await delay(250);
          if (!pages || pages.length === 0) continue;

          await supabase.from('chapters').upsert({
            series_id: s.id,
            chapter_number: item.chapter,
            title: item.title,
            pages,
          }, { onConflict: 'series_id,chapter_number' });

          completedSet.add(String(item.chapter));
          seriesSyncCount++;
          totalPanelsPopulated++;
        }
      } else if (resolved.source === 'mirror') {
        for (const item of resolved.chapters || []) {
          if (seriesSyncCount >= MAX_CHAPTERS_PER_SERIES) break;
          if (completedSet.has(String(item.chapter))) continue;

          const pages = await fetchMirrorPanels(item.id);
          await delay(250);
          if (!pages || pages.length === 0) continue;

          await supabase.from('chapters').upsert({
            series_id: s.id,
            chapter_number: item.chapter,
            title: item.title,
            pages,
          }, { onConflict: 'series_id,chapter_number' });

          completedSet.add(String(item.chapter));
          seriesSyncCount++;
          totalPanelsPopulated++;
        }
      }
    } catch (err) {
      console.error(`Error on "${s.title}":`, err.message);
    } finally {
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
    }
  }

  const { count: remainingUnsynced } = await supabase
    .from('series')
    .select('id', { count: 'exact', head: true })
    .lte('updated_at', '2001-01-01T00:00:00Z');

  const hasMore = (totalPanelsPopulated > 0 || (remainingUnsynced && remainingUnsynced > 0)) ? 'true' : 'false';
  setGithubOutput('has_more', hasMore);
}

runUnifiedSync().catch((err) => {
  console.error('Fatal crash:', err);
  setGithubOutput('has_more', 'false');
  process.exit(1);
});
