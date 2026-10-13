const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const MIRROR_API = axios.create({
  baseURL: 'https://api.comick.fun',
  timeout: 15000,
  headers: { 'User-Agent': 'MangaFlowOneRunBackfill/2.0' }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runCompleteBackfill() {
  console.log('⚡ Starting Complete Single-Run Catalog Backfill...');

  // 1. Fetch ALL series currently in your database (no small limits)
  const { data: allSeries, error: sErr } = await supabase
    .from('series')
    .select('id, title, slug, source_url')
    .order('id', { ascending: true });

  if (sErr || !allSeries || allSeries.length === 0) {
    console.error('Failed to retrieve series:', sErr?.message);
    process.exit(1);
  }

  console.log(`📋 Total series queued for full backfill: ${allSeries.length}`);

  let totalChaptersFilled = 0;
  let currentIndex = 0;

  for (const series of allSeries) {
    currentIndex++;
    const cleanTitle = series.title.replace(/\([^)]*\)/g, '').trim();
    console.log(`\n[${currentIndex}/${allSeries.length}] Processing: "${cleanTitle}"...`);

    try {
      let hid = series.source_url;

      // Resolve Comic HID if not saved as a valid mirror ID
      if (!hid || hid.length > 32) {
        let retries = 3;
        let searchResults = null;

        while (retries > 0) {
          try {
            const res = await MIRROR_API.get('/v1.0/search', {
              params: { q: cleanTitle, limit: 1 }
            });
            searchResults = res.data;
            break;
          } catch (err) {
            if (err.response?.status === 429) {
              console.warn('   ⚠️ Rate-limited on search. Waiting 5 seconds...');
              await sleep(5000);
              retries--;
            } else {
              break;
            }
          }
        }

        if (!searchResults || searchResults.length === 0) {
          console.log(`   └─ ⏩ Not found on mirror. Skipping.`);
          continue;
        }

        hid = searchResults[0].hid;
      }

      // 2. Fetch existing chapters in DB to compare against
      const { data: existingChapters, error: cErr } = await supabase
        .from('chapters')
        .select('chapter_number')
        .eq('series_id', series.id);

      if (cErr) {
        console.error(`   └─ DB read failed:`, cErr.message);
        continue;
      }

      const existingSet = new Set((existingChapters || []).map((c) => Number(c.chapter_number)));

      // 3. Paginate through ALL English chapters on the mirror
      let page = 1;
      let mirrorChapters = [];

      while (page <= 30) { // Crawls up to 3,000 chapters per series
        try {
          const { data: chRes } = await MIRROR_API.get(`/comic/${hid}/chapters`, {
            params: { lang: 'en', page, limit: 100 }
          });

          const batch = chRes.chapters || [];
          mirrorChapters.push(...batch);

          if (batch.length < 100) break;
          page++;
          await sleep(120);
        } catch (fetchErr) {
          if (fetchErr.response?.status === 429) {
            console.warn('   ⚠️ Rate limit reached on chapter pagination. Cooling down 4s...');
            await sleep(4000);
            continue;
          }
          break;
        }
      }

      // 4. Calculate missing chapters
      const missingPayload = [];
      const seen = new Set();

      for (const ch of mirrorChapters) {
        const num = ch.chap ? parseFloat(ch.chap) : null;
        if (num === null || isNaN(num) || seen.has(num)) continue;
        seen.add(num);

        if (!existingSet.has(num)) {
          missingPayload.push({
            series_id: series.id,
            chapter_number: num,
            title: ch.title || `Chapter ${num}`,
            source: ch.hid,
            source_provider: 'mirror',
            panel_urls: []
          });
        }
      }

      // 5. Batch-upsert missing chapters into Supabase
      if (missingPayload.length > 0) {
        for (let i = 0; i < missingPayload.length; i += 200) {
          const chunk = missingPayload.slice(i, i + 200);
          await supabase.from('chapters').upsert(chunk, {
            onConflict: 'series_id, chapter_number'
          });
        }
        totalChaptersFilled += missingPayload.length;
        console.log(`   └─ ✅ Inserted ${missingPayload.length} missing chapters (Total: ${existingSet.size + missingPayload.length}).`);
      } else {
        console.log(`   └─ ⚡ Up to date (${existingSet.size} chapters already indexed).`);
      }

      // Prevent provider rate limiting between titles
      await sleep(250);
    } catch (err) {
      console.error(`   └─ Failed to process "${cleanTitle}":`, err.message);
    }
  }

  console.log(`\n🎉 Backfill complete! Added ${totalChaptersFilled} missing chapters across your catalog.`);
}

runCompleteBackfill();
