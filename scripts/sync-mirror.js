const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MANGADEX_API = axios.create({
  baseURL: 'https://api.mangadex.org',
  timeout: 10000,
  headers: { 'User-Agent': 'MangaFlowOfficialCatalogFiller/3.0' }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runOfficialBacklogSync() {
  console.log('⚡ Starting Complete Backlog Chapter Ingestion...');

  const { data: allSeries, error: sErr } = await supabase
    .from('series')
    .select('id, title, slug, source_url')
    .order('id', { ascending: true });

  if (sErr || !allSeries || allSeries.length === 0) {
    console.error('Failed to load series:', sErr?.message);
    process.exit(1);
  }

  console.log(`📋 Queued ${allSeries.length} series for full chapter crawl.`);

  let totalChaptersFilled = 0;
  let currentIndex = 0;

  for (const series of allSeries) {
    currentIndex++;
    console.log(`\n[${currentIndex}/${allSeries.length}] Scanning: "${series.title}"`);

    let mangaUuid = null;
    if (series.source_url && series.source_url.includes('-')) {
      const match = series.source_url.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (match) mangaUuid = match[0];
    }

    if (!mangaUuid && series.slug && series.slug.includes('-')) {
      const match = series.slug.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (match) mangaUuid = match[0];
    }

    if (!mangaUuid) {
      console.log(`   └─ ⏩ No MangaDex UUID found. Skipping.`);
      continue;
    }

    try {
      const { data: dbChapters, error: cErr } = await supabase
        .from('chapters')
        .select('chapter_number')
        .eq('series_id', series.id);

      if (cErr) {
        console.error(`   └─ DB error:`, cErr.message);
        continue;
      }

      const existingSet = new Set((dbChapters || []).map((c) => Number(c.chapter_number)));

      let offset = 0;
      const limit = 100;
      let totalFetched = 0;
      let pageCount = 0;
      const maxPages = 30; // Max 3,000 chapters per title to prevent hangs
      const missingPayload = [];
      const seenThisRun = new Set();

      while (pageCount < maxPages) {
        pageCount++;
        let res = null;
        let attempts = 0;

        while (attempts < 3) {
          try {
            res = await MANGADEX_API.get(`/manga/${mangaUuid}/feed`, {
              params: {
                translatedLanguage: ['en'],
                order: { chapter: 'asc' },
                limit: limit,
                offset: offset
              }
            });
            break;
          } catch (err) {
            attempts++;
            if (err.response?.status === 429) {
              console.log('   ⚠️ Rate-limited. Pausing 3s...');
              await sleep(3000);
            } else {
              await sleep(1000);
            }
          }
        }

        if (!res || !res.data || !res.data.data || res.data.data.length === 0) {
          break;
        }

        const chapters = res.data.data;
        totalFetched += chapters.length;

        for (const ch of chapters) {
          const chapStr = ch.attributes?.chapter;
          if (!chapStr) continue;

          const num = parseFloat(chapStr);
          if (isNaN(num) || seenThisRun.has(num)) continue;
          seenThisRun.add(num);

          if (!existingSet.has(num)) {
            missingPayload.push({
              series_id: series.id,
              chapter_number: num,
              title: ch.attributes?.title || `Chapter ${num}`,
              source: ch.id,
              source_provider: 'mangadex',
              panel_urls: []
            });
          }
        }

        const totalAvailable = res.data.total || 0;
        if (totalFetched >= totalAvailable || chapters.length < limit) {
          break;
        }

        offset += limit;
        await sleep(250);
      }

      if (missingPayload.length > 0) {
        for (let i = 0; i < missingPayload.length; i += 200) {
          const chunk = missingPayload.slice(i, i + 200);
          await supabase.from('chapters').upsert(chunk, {
            onConflict: 'series_id, chapter_number'
          });
        }
        totalChaptersFilled += missingPayload.length;
        console.log(`   └─ ✅ Added ${missingPayload.length} missing chapters (Total: ${existingSet.size + missingPayload.length}).`);
      } else {
        console.log(`   └─ ⚡ Up to date (${existingSet.size} chapters present).`);
      }

      await sleep(200);
    } catch (err) {
      console.error(`   └─ Error on "${series.title}":`, err.message);
    }
  }

  console.log(`\n🎉 Backfill finished! Added ${totalChaptersFilled} missing chapters.`);
}

runOfficialBacklogSync();
