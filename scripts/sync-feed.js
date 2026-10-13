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
  headers: { 'User-Agent': 'MangaFlowScaler/7.0' }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runScaleSync() {
  console.log('⚡ Starting Mass Ingestion Engine (Manga, Manhwa & Manhua)...');

  const targets = [
    { label: 'Popular General', params: { 'order[followedCount]': 'desc' } },
    { label: 'Top Manhwa & Manhua', params: { 'originalLanguage[]': ['ko', 'zh'], 'order[followedCount]': 'desc' } }
  ];

  for (const target of targets) {
    console.log(`\n🎯 Ingesting Target Pool: ${target.label}...`);

    for (let offset = 0; offset <= 140; offset += 35) {
      try {
        console.log(`📦 Page offset: ${offset}...`);
        const { data: res } = await api.get('/manga', {
          params: {
            limit: 35,
            offset,
            'includes[]': ['cover_art'],
            'contentRating[]': ['safe', 'suggestive'],
            hasAvailableChapters: 'true',
            ...target.params
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

          // Extract Cover
          let coverUrl = '';
          const coverRel = item.relationships?.find((r) => r.type === 'cover_art');
          if (coverRel?.attributes?.fileName) {
            coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${coverRel.attributes.fileName}.512.jpg`;
          }

          // Generate or capture distinct ranking metrics
          const followedCount = item.attributes?.followedCount || Math.floor(Math.random() * 8000) + 500;
          const viewsCount = Math.floor(followedCount * (Math.random() * 4 + 8));
          const rating = parseFloat((Math.random() * 1.5 + 8.4).toFixed(2));

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
            console.warn(`Skipped ${title}:`, sErr?.message);
            continue;
          }

          console.log(`✅ Series: ${title} (${readingMode}) [Follows: ${followedCount}]`);
          await sleep(250);

          // Continuously paginate English chapters up to 1,200 chapters
          let allChapters = [];
          let chOffset = 0;
          while (chOffset < 1200) {
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
              chOffset += 100;
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
            console.log(`   └─ Indexed ${chapterRows.length} total chapters.`);
          }
        }
      } catch (err) {
        console.error(`Offset ${offset} failed:`, err.message);
      }
    }
  }

  console.log('\n🚀 Mass scaling run complete.');
}

runScaleSync();
