// Polyfill WebSocket for Node.js < 22 environments
try {
  if (typeof global.WebSocket === 'undefined') {
    global.WebSocket = require('ws');
  }
} catch {
  // Continue if ws is not present
}

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

let getScanGroupChapters = null;
let getMangaPlusChapters = null;

try {
  ({ getScanGroupChapters } = require('../lib/providers/scangroups'));
} catch {
  getScanGroupChapters = async () => [];
}

try {
  ({ getMangaPlusChapters } = require('../lib/providers/mangaplus'));
} catch {
  getMangaPlusChapters = async () => [];
}

// 1. Resolve and sanitize Supabase credentials
let rawUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY;

if (!rawUrl || !supabaseKey) {
  console.error('❌ Critical Error: Supabase credentials missing.');
  process.exit(1);
}

const supabaseUrl = rawUrl.trim().replace(/\/+$/, '').split('/rest/v1')[0];

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const mdHttp = axios.create({
  baseURL: 'https://api.mangadex.org',
  timeout: 15000,
  headers: { 'User-Agent': 'MangaFlowCollector/1.0' },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function safeGet(url, params = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await sleep(250);
      const res = await mdHttp.get(url, { params });
      return res.data;
    } catch (err) {
      if (err.response?.status === 429) {
        console.warn(`⏳ Rate-limited. Cooling down for 3s (Attempt ${attempt}/3)...`);
        await sleep(3000);
      } else {
        return null;
      }
    }
  }
  return null;
}

// Convert chapter UUID to panel image URLs
async function fetchChapterPages(chapterUuid) {
  try {
    const data = await safeGet(`/at-home/server/${chapterUuid}`);
    const host = data?.baseUrl;
    const hash = data?.chapter?.hash;
    const files = data?.chapter?.data || [];

    if (!host || !hash || !files.length) return [];
    return files.map((fileName) => `${host}/data/${hash}/${fileName}`);
  } catch {
    return [];
  }
}

// Search MangaDex for UUID, official high-res cover, and synopsis
async function searchMangaDex(title) {
  try {
    const cleanTitle = title.replace(/[\[\(\]\)]/g, ' ').trim();
    const data = await safeGet('/manga', {
      title: cleanTitle,
      limit: 1,
      'includes[]': 'cover_art',
    });

    const manga = data?.data?.[0];
    if (!manga) return null;

    const coverRel = manga.relationships?.find((r) => r.type === 'cover_art');
    const fileName = coverRel?.attributes?.fileName;
    const coverUrl = fileName
      ? `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.512.jpg`
      : null;

    const desc = manga.attributes?.description?.en || null;

    return {
      uuid: manga.id,
      coverUrl,
      description: desc,
    };
  } catch {
    return null;
  }
}

// Get up to 100 recent English chapters from MangaDex
async function getGeneralEnglishChapters(mangaUuid) {
  try {
    const data = await safeGet(`/manga/${mangaUuid}/feed`, {
      translatedLanguage: ['en'],
      order: { chapter: 'desc' },
      limit: 100,
    });

    const items = data?.data || [];
    return items.map((ch) => ({
      chapter_number: parseFloat(ch.attributes?.chapter) || 0,
      title: ch.attributes?.title || `Chapter ${ch.attributes?.chapter}`,
      source: ch.id,
    }));
  } catch {
    return [];
  }
}

async function runMaxSync() {
  console.log('🚀 Launching MangaFlow High-Capacity Sync Engine...');

  try {
    // 1. Fetch batch of 120 series safely without throwing if updated_at is fresh
    const { data: seriesList, error: sErr } = await supabase
      .from('series')
      .select('id, title, slug, cover_url, description')
      .limit(120);

    if (sErr) throw sErr;
    console.log(`📚 Processing ${seriesList.length} series in this run batch...`);

    let totalPanelsSynced = 0;
    let totalChaptersCreated = 0;

    for (let i = 0; i < seriesList.length; i++) {
      const series = seriesList[i];
      console.log(`\n[${i + 1}/${seriesList.length}] 🔍 "${series.title}"`);
      const mdInfo = await searchMangaDex(series.title);

      if (!mdInfo?.uuid) {
        console.log(`  ⚠️ No match found for "${series.title}"`);
        continue;
      }

      // 1. Update cover art & description if missing or demo placeholder
      const updates = {};
      if (mdInfo.coverUrl && (!series.cover_url || series.cover_url.includes('picsum'))) {
        updates.cover_url = mdInfo.coverUrl;
      }
      if (mdInfo.description && !series.description) {
        updates.description = mdInfo.description;
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('series').update(updates).eq('id', series.id);
      }

      // 2. Discover available chapters from scan groups or general feed
      let providerChapters = [];
      for (const group of ['asura', 'temple', 'hive']) {
        const chapters = await getScanGroupChapters(mdInfo.uuid, group);
        if (chapters && chapters.length > 0) {
          providerChapters = chapters;
          break;
        }
      }

      if (providerChapters.length === 0) {
        providerChapters = await getGeneralEnglishChapters(mdInfo.uuid);
      }

      if (providerChapters.length === 0) {
        providerChapters = await getMangaPlusChapters(series.title);
      }

      // 3. Fetch existing chapters in DB for this series
      const { data: dbChapters } = await supabase
        .from('chapters')
        .select('id, chapter_number, pages')
        .eq('series_id', series.id);

      const existingMap = new Map();
      (dbChapters || []).forEach((c) => existingMap.set(c.chapter_number, c));

      // 4. Fill empty or broken pages on existing chapters
      for (const ch of dbChapters || []) {
        const hasValidPages = Array.isArray(ch.pages) && ch.pages.length > 0 && !ch.pages[0].includes('picsum');
        if (hasValidPages) continue;

        const matched = providerChapters.find(
          (pc) => Math.abs(pc.chapter_number - ch.chapter_number) < 0.01
        );

        if (matched?.source && !matched.source.startsWith('mangaplus_')) {
          const pages = await fetchChapterPages(matched.source);
          if (pages.length > 0) {
            await supabase.from('chapters').update({ pages }).eq('id', ch.id);
            totalPanelsSynced += pages.length;
            console.log(`  ✅ Synced ${pages.length} panels into Ch. ${ch.chapter_number}`);
          }
        }
      }

      // 5. Insert up to 50 missing chapters per series
      const missingChapters = providerChapters
        .filter((pc) => !existingMap.has(pc.chapter_number) && !pc.source.startsWith('mangaplus_'))
        .slice(0, 50);

      for (const newCh of missingChapters) {
        const pages = await fetchChapterPages(newCh.source);
        if (pages.length > 0) {
          await supabase.from('chapters').insert({
            series_id: series.id,
            chapter_number: newCh.chapter_number,
            title: newCh.title,
            pages,
            scan_group: 'MangaDex',
          });
          totalChaptersCreated++;
          console.log(`  ✨ Added missing Ch. ${newCh.chapter_number} (${pages.length} panels)`);
        }
      }
    }

    console.log(`\n🎉 Batch complete: Added ${totalChaptersCreated} chapters and synced ${totalPanelsSynced} panels.`);
  } catch (err) {
    console.error('❌ Sync script encountered an error:', err.message);
    process.exit(1);
  }
}

runMaxSync();
