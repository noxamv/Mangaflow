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
  headers: { 'User-Agent': 'MangaFlowEngine/4.0' }
});

// Helper: pause between requests to prevent MangaDex 429 rate-limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runMassiveSync() {
  console.log('⚡ Starting Mass Ingestion (Manga, Manhwa & Manhua)...');

  // Pull 60 series across two 30-title pages
  for (let offset = 0; offset <= 30; offset += 30) {
    try {
      console.log(`\n📦 Fetching series batch with offset: ${offset}...`);
      const { data: res } = await api.get('/manga', {
        params: {
          limit: 30,
          offset: offset,
          'originalLanguage[]': ['ja', 'ko', 'zh'], // All three formats
          'order[followedCount]': 'desc',
          'includes[]': ['cover_art'],
          'contentRating[]': ['safe', 'suggestive'],
          hasAvailableChapters: 'true'
        }
      });

      const mangaList = res.data || [];

      for (const item of mangaList) {
        const mangaId = item.id;
        const title =
          item.attributes.title.en ||
          Object.values(item.attributes.title)[0] ||
          'Untitled Series';
        
        const synopsis =
          item.attributes.description?.en ||
          'Read manga and manhwa online on Manga Flow.';
        
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

        // 1. Upsert Series
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

        if (sErr || !seriesRow) {
          console.warn(`Skipped series ${title}:`, sErr?.message);
          continue;
        }

        console.log(`✅ Series Saved: ${title}`);
        await sleep(250); // Respect rate-limit

        // 2. Fetch Chapters (English, sorted ascending Ch. 1 -> latest)
        const { data: feed } = await api.get(`/manga/${mangaId}/feed`, {
          params: {
            limit: 60,
            'translatedLanguage[]': ['en'],
            'order[chapter]': 'asc',
            includeEmptyPages: 0
          }
        });

        const chapters = feed.data || [];
        const chapterRows = [];
        const seenChapters = new Set();

        for (const ch of chapters) {
          // Fallback parsing for chapter numbers
          const rawNum = ch.attributes.chapter;
          const chNumber = rawNum ? parseFloat(rawNum) : null;

          if (chNumber === null || isNaN(chNumber)) continue;
          if (seenChapters.has(chNumber)) continue; // Avoid duplicate translations of same chapter
          seenChapters.add(chNumber);

          chapterRows.push({
            series_id: seriesRow.id,
            chapter_number: chNumber,
            title: ch.attributes.title || `Chapter ${chNumber}`,
            source: ch.id,
            panel_urls: [] // Hybrid zero-storage footprint
          });
        }

        // 3. Save all chapters to Supabase
        if (chapterRows.length > 0) {
          await supabase.from('chapters').upsert(chapterRows, {
            onConflict: 'series_id, chapter_number'
          });
          console.log(`   └─ Indexed ${chapterRows.length} chapters.`);
        } else {
          console.log(`   └─ No translated English chapters available.`);
        }

        await sleep(300);
      }
    } catch (err) {
      console.error(`Batch offset ${offset} failed:`, err.message);
    }
  }

  console.log('\n🚀 Mass ingestion completed successfully.');
}

runMassiveSync();
