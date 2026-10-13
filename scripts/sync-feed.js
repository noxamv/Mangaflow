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
  headers: { 'User-Agent': 'MangaFlowAutoSync/3.0' }
});

async function runExpandedSync() {
  console.log('⚡ Starting multi-page ingestion (Manga, Manhwa, Manhua)...');

  // Loop through 2 pages of 25 titles each (50 total per run)
  for (let offset = 0; offset <= 25; offset += 25) {
    try {
      const { data: res } = await api.get('/manga', {
        params: {
          limit: 25,
          offset: offset,
          'originalLanguage[]': ['ja', 'ko', 'zh'], // Manga, Manhwa & Manhua
          'order[followedCount]': 'desc',
          'includes[]': ['cover_art'],
          'contentRating[]': ['safe', 'suggestive'],
          hasAvailableChapters: 'true'
        }
      });

      for (const item of res.data) {
        const mangaId = item.id;
        const title = item.attributes.title.en || Object.values(item.attributes.title)[0] || 'Untitled';
        const synopsis = item.attributes.description.en || 'Read online on Manga Flow.';
        const slug = (item.attributes.title.en || mangaId)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 60);

        const origLang = item.attributes.originalLanguage;
        const readingMode = (origLang === 'ko' || origLang === 'zh') ? 'webtoon' : 'manga';

        // Extract Cover
        let coverUrl = '';
        const coverRel = item.relationships.find((r) => r.type === 'cover_art');
        if (coverRel && coverRel.attributes && coverRel.attributes.fileName) {
          coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${coverRel.attributes.fileName}.512.jpg`;
        }

        // Upsert Series
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

        // Fetch up to 50 English chapters
        const { data: feed } = await api.get(`/manga/${mangaId}/feed`, {
          params: {
            limit: 50,
            'translatedLanguage[]': ['en'],
            'order[chapter]': 'asc'
          }
        });

        const chapters = feed.data || [];
        const chapterRows = [];

        for (const ch of chapters) {
          const chNumber = parseFloat(ch.attributes.chapter);
          if (isNaN(chNumber)) continue;

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
        }
      }
    } catch (err) {
      console.error(`Error on offset ${offset}:`, err.message);
    }
  }

  console.log('✅ Multi-page sync complete.');
}

runExpandedSync();
