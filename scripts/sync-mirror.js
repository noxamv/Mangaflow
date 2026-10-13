const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const MANGADEX_API = axios.create({
  baseURL: 'https://api.mangadex.org',
  timeout: 15000,
  headers: {
    'User-Agent': 'MangaFlowOfficialCatalogFiller/3.0'
  }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runOfficialBacklogSync() {
  console.log('⚡ Starting Complete MangaDex Backlog Chapter Ingestion...');

  // 1. Fetch series from database
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

    // Extract MangaDex UUID
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
      console.log(`   └─ ⏩ No MangaDex UUID found in source_url/slug. Skipping.`);
      continue;
    }

    try {
      // 2. Fetch existing chapters currently recorded in Supabase
      const { data: dbChapters, error: cErr } = await supabase
        .from('chapters')
        .select('chapter_number')
        .eq('series_id', series.id);

      if (cErr) {
        console.error(`   └─ DB error:`, cErr.message);
        continue;
      }

      const existingSet = new Set((dbChapters || []).map((c) => Number(c.chapter_number)));

      // 3. Paginate through ALL English chapters on MangaDex
      let offset = 0;
      const limit = 100;
      let totalFetched = 0;
      const missingPayload = [];
      const seenThisRun = new Set();

      while (true) {
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
              console.log('   ⚠️ MangaDex rate limit reached. Waiting 3s...');
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

        if (totalFetched >= res.data.total || chapters.length < limit) {
          break;
        }

        offset += limit;
        await sleep(250); // MangaDex allows 5 req/sec safely
      }

      // 4. Upsert missing chapters in chunks
      if (missingPayload.length > 0) {
        for (let i = 0; i < missingPayload.length; i += 200) {
          const chunk = missingPayload.slice(i, i + 200);
          await supabase.from('chapters').upsert(chunk, {
            onConflict: 'series_id, chapter_number'
          });
        }
        totalChaptersFilled += missingPayload.length;
        console.log(`   └─ ✅ Added ${missingPayload.length} missing chapters (Total in DB: ${existingSet.size + missingPayload.length}).`);
      } else {
        console.log(`   └─ ⚡ Complete (${existingSet.size} chapters already up to date).`);
      }

      await sleep(250);
    } catch (err) {
      console.error(`   └─ Error on "${series.title}":`, err.message);
    }
  }

  console.log(`\n🎉 Finished! Successfully added ${totalChaptersFilled} missing chapters directly from MangaDex.`);
}

runOfficialBacklogSync();
