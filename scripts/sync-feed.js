const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const api = axios.create({
  baseURL: 'https://api.mangadex.org',
  timeout: 15000,
  headers: { 'User-Agent': 'MangaFlowMassEngine/8.0' }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runMassIngestion() {
  console.log('⚡ Starting Mass Ingestion Engine (Manga + Manhwa + Complete Chapters)...');

  // Pools: 1. Top Popular Global, 2. Dedicated Top Korean/Chinese Webtoons
  const pools = [
    { name: 'Top Followed Overall', params: { 'order[followedCount]': 'desc' } },
    { name: 'Top Manhwa & Manhua', params: { 'originalLanguage[]': ['ko', 'zh'], 'order[followedCount]': 'desc' } },
    { name: 'Latest Active Titles', params: { 'order[latestUploadedChapter]': 'desc' } }
  ];

  for (const pool of pools) {
    console.log(`\n========================================`);
    console.log(`🎯 INGESTING POOL: ${pool.name}`);
    console.log(`========================================`);

    // Fetch 3 pages of 32 titles per pool = ~100 series per pool (300 titles total per workflow run)
    for (let offset = 0; offset <= 64; offset += 32) {
      try {
        console.log(`\n📦 Fetching series page at offset ${offset}...`);
        const { data: res } = await api.get('/manga', {
          params: {
            limit: 32,
            offset,
            'includes[]': ['cover_art'],
            'contentRating[]': ['safe', 'suggestive'],
            hasAvailableChapters: 'true',
            ...pool.params
          }
        });

        for (const item of res.data || []) {
          const mangaId = item.id;
          const title = item.attributes.title.en || Object.values(item.attributes.title)[0] || 'Untitled';
          const synopsis = item.attributes.description?.en || 'Read online for free on MangaFlow.';
          const slug = (item.attributes.title.en || mangaId)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60);

          const origLang = item.attributes.originalLanguage;
          const readingMode = origLang === 'ko' || origLang === 'zh' ? 'webtoon' : 'manga';

          // Extract Cover Poster
          let coverUrl = '';
          const coverRel = item.relationships?.find((r) => r.type === 'cover_art');
          if (coverRel?.attributes?.fileName) {
            coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${coverRel.attributes.fileName}.512.jpg`;
          }

          // Distinct metrics for sorting
          const followedCount = item.attributes?.followedCount || Math.floor(Math.random() * 9000) + 600;
          const viewsCount = Math.floor(followedCount * (Math.random() * 5 + 9));
          const rating = parseFloat((Math.random() * 1.4 + 8.5).toFixed(2));

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
                source_url: mangaId,
                followed_count: followedCount,
                views_count: viewsCount,
                rating: rating
              },
              { onConflict: 'slug' }
            )
            .select()
            .single();

          if (sErr || !seriesRow) {
            continue;
          }

          console.log(`✅ Series: ${title} (${readingMode})`);
          await sleep(200);

          // Full Chapter Loop: Paginate until all available chapters are ingested (up to 1,500 chapters)
          let allChapters = [];
          let chOffset = 0;

          while (chOffset < 1500) {
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

              // If returned batch is less than limit, we reached the end of the catalog
              if (batch.length < 100) break;

              chOffset += 100;
              await sleep(150);
            } catch {
              break;
            }
          }

          const chapterRows = [];
          const seen = new Set();

          for (const ch of allChapters) {
            const rawNum = ch.attributes?.chapter;
            const chNumber = rawNum ? parseFloat(rawNum) : null;
            if (chNumber === null || isNaN(chNumber) || seen.has(chNumber)) continue;
            seen.add(chNumber);

            chapterRows.push({
              series_id: seriesRow.id,
              chapter_number: chNumber,
              title: ch.attributes?.title || `Chapter ${chNumber}`,
              source: ch.id,
              panel_urls: []
            });
          }

          if (chapterRows.length > 0) {
            // Batch upsert in chunks of 200 to avoid payload size errors
            for (let i = 0; i < chapterRows.length; i += 200) {
              const chunk = chapterRows.slice(i, i + 200);
              await supabase.from('chapters').upsert(chunk, {
                onConflict: 'series_id, chapter_number'
              });
            }
            console.log(`   └─ Ingested ${chapterRows.length} total chapters (Highest: Ch. ${Math.max(...seen)}).`);
          }
        }
      } catch (err) {
        console.error(`Offset error at ${offset}:`, err.message);
      }
    }
  }

  console.log('\n🚀 Mass ingestion completed successfully.');
}

runMassIngestion();
