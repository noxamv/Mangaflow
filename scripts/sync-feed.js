const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment secrets.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const api = axios.create({
  baseURL: 'https://api.mangadex.org',
  timeout: 15000,
  headers: { 'User-Agent': 'MangaFlowIndexer/5.0' }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runScaleIngestion() {
  console.log('⚡ Starting Mass Library Scaling Engine...');

  // Ingest across 6 pages of 35 titles (210 titles per run)
  for (let offset = 0; offset <= 175; offset += 35) {
    try {
      console.log(`\n📦 Ingesting catalog page at offset: ${offset}...`);
      const { data: res } = await api.get('/manga', {
        params: {
          limit: 35,
          offset: offset,
          'order[followedCount]': 'desc',
          'includes[]': ['cover_art'],
          'contentRating[]': ['safe', 'suggestive'],
          hasAvailableChapters: 'true'
        }
      });

      for (const item of res.data || []) {
        const mangaId = item.id;
        const title = item.attributes.title.en || Object.values(item.attributes.title)[0] || 'Untitled';
        const synopsis = item.attributes.description?.en || 'Read online on Manga Flow.';
        const slug = (item.attributes.title.en || mangaId)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 60);

        const origLang = item.attributes.originalLanguage;
        const readingMode = origLang === 'ko' || origLang === 'zh' ? 'webtoon' : 'manga';

        let coverUrl = '';
        const coverRel = item.relationships?.find((r) => r.type === 'cover_art');
        if (coverRel?.attributes?.fileName) {
          coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${coverRel.attributes.fileName}.512.jpg`;
        }

        const { data: seriesRow, error: sErr } = await supabase
          .from('series')
          .upsert(
            {
              slug,
              title,
              synopsis: synopsis.slice(0, 350),
              cover_image_url: coverUrl,
              reading_mode: readingMode,
              source: 'mangadex',
              source_url: mangaId
            },
            { onConflict: 'slug' }
          )
          .select()
          .single();

        if (sErr || !seriesRow) continue;
        console.log(`✅ Synced: ${title}`);
        await sleep(220);

        // Fetch up to 500 English chapters across paginated feed requests
        let allChapters = [];
        for (let chOffset = 0; chOffset < 500; chOffset += 100) {
          try {
            const { data: feed } = await api.get(`/manga/${mangaId}/feed`, {
              params: {
                limit: 100,
                offset: chOffset,
                'translatedLanguage[]': ['en'],
                'order[chapter]': 'asc'
              }
            });
            const batch = feed.data || [];
            allChapters.push(...batch);
            if (batch.length < 100) break;
            await sleep(200);
          } catch {
            break;
          }
        }

        const chapterRows = [];
        const seen = new Set();

        for (const ch of allChapters) {
          const rawNum = ch.attributes.chapter;
          const chNumber = rawNum ? parseFloat(rawNum) : null;
          if (chNumber === null || isNaN(chNumber) || seen.has(chNumber)) continue;
          seen.add(chNumber);

          chapterRows.push({
            series_id: seriesRow.id,
            chapter_number: chNumber,
            title: ch.attributes.title || `Chapter ${chNumber}`,
            source: ch.id,
            panel_urls: []
          });
        }

        if (chapterRows.length > 0) {
          await supabase.from('chapters').upsert(chapterRows, {
            onConflict: 'series_id, chapter_number'
          });
          console.log(`   └─ ${chapterRows.length} total chapters indexed.`);
        }
      }
    } catch (err) {
      console.error(`Page ${offset} failed:`, err.message);
    }
  }

  console.log('\n🚀 Mass scaling run complete.');
}

runScaleIngestion();
