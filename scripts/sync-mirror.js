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
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sanitizeSearchQuery(title) {
  return title
    .replace(/[“”"']/g, '') // Remove curly and straight quotes
    .replace(/\([^)]*\)/g, '') // Remove brackets/parentheses
    .replace(/\[[^\]]*\]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip accents (e.g. Nán -> Nan)
    .replace(/[-_:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function runCompleteBackfill() {
  console.log('⚡ Starting Refined Catalog Chapter Backfill...');

  const { data: allSeries, error: sErr } = await supabase
    .from('series')
    .select('id, title, slug, source_url')
    .order('id', { ascending: true });

  if (sErr || !allSeries || allSeries.length === 0) {
    console.error('Failed to retrieve series:', sErr?.message);
    process.exit(1);
  }

  console.log(`📋 Total series queued: ${allSeries.length}`);

  let totalChaptersFilled = 0;
  let currentIndex = 0;

  for (const series of allSeries) {
    currentIndex++;
    const cleanQuery = sanitizeSearchQuery(series.title);
    console.log(`\n[${currentIndex}/${allSeries.length}] Checking: "${series.title}" -> Search: "${cleanQuery}"`);

    try {
      let hid = null;

      // 1. If source_url is already a 32-char Comick HID
      if (series.source_url && series.source_url.length <= 32 && !series.source_url.includes('-')) {
        hid = series.source_url;
      }

      // 2. Otherwise search Comick with clean query
      if (!hid) {
        let attempts = 0;
        let searchResults = null;

        while (attempts < 2) {
          try {
            const res = await MIRROR_API.get('/v1.0/search', {
              params: { q: cleanQuery, limit: 3 }
            });
            searchResults = res.data;
            break;
          } catch (err) {
            attempts++;
            await sleep(1500);
          }
        }

        if (searchResults && searchResults.length > 0) {
          hid = searchResults[0].hid;
        }
      }

      if (!hid) {
        console.log(`   └─ ⏩ Not found on mirror. Skipping.`);
        await sleep(200);
        continue;
      }

      // 3. Fetch existing chapter numbers in DB
      const { data: existingChapters, error: cErr } = await supabase
        .from('chapters')
        .select('chapter_number')
        .eq('series_id', series.id);

      if (cErr) {
        console.error(`   └─ DB read failed:`, cErr.message);
        continue;
      }

      const existingSet = new Set((existingChapters || []).map((c) => Number(c.chapter_number)));

      // 4. Paginate all English chapters from mirror
      let page = 1;
      let mirrorChapters = [];

      while (page <= 25) {
        try {
          const { data: chRes } = await MIRROR_API.get(`/comic/${hid}/chapters`, {
            params: { lang: 'en', page, limit: 100 }
          });

          const batch = chRes.chapters || [];
          mirrorChapters.push(...batch);

          if (batch.length < 100) break;
          page++;
          await sleep(150);
        } catch {
          break;
        }
      }

      // 5. Build missing chapter list
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

      // 6. Save missing chapters to Supabase
      if (missingPayload.length > 0) {
        for (let i = 0; i < missingPayload.length; i += 200) {
          const chunk = missingPayload.slice(i, i + 200);
          await supabase.from('chapters').upsert(chunk, {
            onConflict: 'series_id, chapter_number'
          });
        }
        totalChaptersFilled += missingPayload.length;
        console.log(`   └─ ✅ Added ${missingPayload.length} missing chapters! (Total now: ${existingSet.size + missingPayload.length})`);
      } else {
        console.log(`   └─ ⚡ Up to date (${existingSet.size} chapters present).`);
      }

      await sleep(350);
    } catch (err) {
      console.error(`   └─ Error processing "${series.title}":`, err.message);
    }
  }

  console.log(`\n🎉 Backfill complete! Added ${totalChaptersFilled} missing chapters.`);
}

runCompleteBackfill();
