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
  timeout: 12000,
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

// Helper: Search MangaDex for a manga title to obtain its UUID and official cover
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
      console.log(`\n🔍 Searching source catalogs for: "${series.title}"`);
      const mdInfo = await searchMangaDex(series.title);

      // Update real cover art if missing or currently a placeholder
      if (mdInfo?.coverUrl && (!series.cover_url || series.cover_url.includes('picsum'))) {
        await supabase
          .from('series')
          .update({ cover_url: mdInfo.coverUrl })
          .eq('id', series.id);
        console.log(`🖼️ Updated real cover art for: ${series.title}`);
      }

      // Check scan groups (Asura, Temple, Hive) via your scangroups provider
      let providerChapters = [];
      if (mdInfo?.uuid) {
        for (const group of ['asura', 'temple', 'hive']) {
          const chapters = await getScanGroupChapters(mdInfo.uuid, group);
          if (chapters.length > 0) {
            providerChapters = chapters;
            console.log(`📡 Discovered ${chapters.length} chapters from provider group: ${group}`);
            break;
          }
        }
      }

      // Fallback check to MangaPlus provider
      if (providerChapters.length === 0) {
        const mpChapters = await getMangaPlusChapters(series.title);
        if (mpChapters.length > 0) {
          console.log(`📡 Discovered ${mpChapters.length} chapters from MangaPlus.`);
          providerChapters = mpChapters;
        }
      }

      // Fetch pending chapters in Supabase for this series
      const { data: dbChapters } = await supabase
        .from('chapters')
        .select('id, chapter_number, pages')
        .eq('series_id', series.id)
        .limit(10);

      if (!dbChapters || dbChapters.length === 0) continue;

      for (const ch of dbChapters) {
        // Find matching chapter from scanned sources
        const matchedSource = providerChapters.find(
          (pc) => Math.abs(pc.chapter_number - ch.chapter_number) < 0.01
        );

        if (matchedSource?.source && !matchedSource.source.startsWith('mangaplus_')) {
          const pages = await fetchChapterPages(matchedSource.source);
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
