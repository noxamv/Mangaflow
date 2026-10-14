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
const { getScanGroupChapters } = require('../lib/providers/scangroups');
const { getMangaPlusChapters } = require('../lib/providers/mangaplus');

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

// Helper: Convert MangaDex chapter UUID to full array of panel image URLs
async function fetchChapterPages(chapterUuid) {
  try {
    const res = await mdHttp.get(`/at-home/server/${chapterUuid}`);
    const host = res.data?.baseUrl;
    const hash = res.data?.chapter?.hash;
    const files = res.data?.chapter?.data || [];

    if (!host || !hash || !files.length) return [];

    return files.map((fileName) => `${host}/data/${hash}/${fileName}`);
  } catch (err) {
    return [];
  }
}

// Helper: Search MangaDex for a manga title to obtain UUID and official cover
async function searchMangaDex(title) {
  try {
    const cleanTitle = title.replace(/[\[\(\]\)]/g, ' ').trim();
    const res = await mdHttp.get('/manga', {
      params: {
        title: cleanTitle,
        limit: 1,
        'includes[]': 'cover_art',
      },
    });

    const manga = res.data?.data?.[0];
    if (!manga) return null;

    const coverRel = manga.relationships?.find((r) => r.type === 'cover_art');
    const fileName = coverRel?.attributes?.fileName;
    const coverUrl = fileName
      ? `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.512.jpg`
      : null;

    return {
      uuid: manga.id,
      coverUrl,
    };
  } catch {
    return null;
  }
}

// Helper: Get English chapters from any active group if specific scan groups return empty
async function getGeneralEnglishChapters(mangaUuid) {
  try {
    const res = await mdHttp.get(`/manga/${mangaUuid}/feed`, {
      params: {
        translatedLanguage: ['en'],
        order: { chapter: 'desc' },
        limit: 100,
      },
    });

    const items = res.data?.data || [];
    return items.map((ch) => ({
      chapter_number: parseFloat(ch.attributes?.chapter) || 0,
      title: ch.attributes?.title || `Chapter ${ch.attributes?.chapter}`,
      source: ch.id,
    }));
  } catch {
    return [];
  }
}

async function runSync() {
  console.log('🚀 Starting MangaFlow multi-source sync engine...');

  try {
    // 1. Fetch series from database
    const { data: seriesList, error: sErr } = await supabase
      .from('series')
      .select('id, title, slug, cover_url')
      .limit(10);

    if (sErr) throw sErr;
    console.log(`📚 Found ${seriesList.length} series to evaluate.`);

    for (const series of seriesList) {
      console.log(`\n🔍 Checking: "${series.title}"`);
      const mdInfo = await searchMangaDex(series.title);

      if (!mdInfo?.uuid) {
        console.log(`⚠️ No match found for "${series.title}"`);
        continue;
      }

      // Update real cover art if missing or currently a placeholder
      if (mdInfo.coverUrl && (!series.cover_url || series.cover_url.includes('picsum'))) {
        await supabase
          .from('series')
          .update({ cover_url: mdInfo.coverUrl })
          .eq('id', series.id);
        console.log(`🖼️ Updated real cover art for: ${series.title}`);
      }

      // First check target scan groups (Asura, Temple, Hive)
      let providerChapters = [];
      for (const group of ['asura', 'temple', 'hive']) {
        const chapters = await getScanGroupChapters(mdInfo.uuid, group);
        if (chapters.length > 0) {
          providerChapters = chapters;
          console.log(`📡 Discovered ${chapters.length} chapters from scan group: ${group}`);
          break;
        }
      }

      // If specific groups have no upload for this series, fall back to general English feed
      if (providerChapters.length === 0) {
        providerChapters = await getGeneralEnglishChapters(mdInfo.uuid);
        if (providerChapters.length > 0) {
          console.log(`📡 Discovered ${providerChapters.length} chapters from general feed`);
        }
      }

      // Fetch pending chapters from your Supabase table for this series
      const { data: dbChapters } = await supabase
        .from('chapters')
        .select('id, chapter_number, pages')
        .eq('series_id', series.id)
        .limit(10);

      if (!dbChapters || dbChapters.length === 0) continue;

      for (const ch of dbChapters) {
        const matched = providerChapters.find(
          (pc) => Math.abs(pc.chapter_number - ch.chapter_number) < 0.01
        );

        if (matched?.source) {
          const pages = await fetchChapterPages(matched.source);
          if (pages.length > 0) {
            await supabase
              .from('chapters')
              .update({ pages })
              .eq('id', ch.id);
            console.log(`✅ Synced ${pages.length} real panels into Ch. ${ch.chapter_number}`);
          }
        }
      }
    }

    console.log('\n🏁 MangaFlow sync cycle completed cleanly.');
  } catch (err) {
    console.error('❌ Sync script encountered an error:', err.message);
    process.exit(1);
  }
}

runSync();
