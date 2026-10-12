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
  headers: { 'User-Agent': 'MangaFlow/2.0' }
});

async function syncCatalog() {
  console.log('⚡ Syncing Top Korean Manhwa & Chinese Manhua...');

  try {
    // 1. Fetch top Manhwa (Korean 'ko') and Manhua (Chinese 'zh')
    const { data: res } = await api.get('/manga', {
      params: {
        limit: 15,
        'originalLanguage[]': ['ko', 'zh'], // Manhwa & Manhua
        'order[followedCount]': 'desc',
        'includes[]': ['cover_art'],
        'contentRating[]': ['safe', 'suggestive'],
        hasAvailableChapters: 'true'
      }
    });

    for (const item of res.data) {
      const mangaId = item.id;
      const title = item.attributes.title.en || Object.values(item.attributes.title)[0] || 'Untitled';
      const synopsis = item.attributes.description.en || 'Read manhwa online on Manga Flow.';
      const slug = (item.attributes.title.en || mangaId)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);

      // Cover Art
      let coverUrl = '';
      const coverRel = item.relationships.find((r) => r.type === 'cover_art');
      if (coverRel && coverRel.attributes && coverRel.attributes.fileName) {
        coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${coverRel.attributes.fileName}.512.jpg`;
      }

      // Upsert Series as 'webtoon'
      const { data: seriesRow, error: sErr } = await supabase
        .from('series')
        .upsert(
          {
            slug,
            title,
            synopsis: synopsis.slice(0, 350),
            cover_image_url: coverUrl,
            reading_mode: 'webtoon',
            source: 'mangadex',
            source_url: mangaId
          },
          { onConflict: 'slug' }
        )
        .select()
        .single();

      if (sErr || !seriesRow) continue;
      console.log(`\n📚 Synced Manhwa: ${title}`);

      // 2. Fetch up to 100 English chapters
      const { data: feed } = await api.get(`/manga/${mangaId}/feed`, {
        params: {
          limit: 100,
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
          source: ch.id, // MangaDex chapter UUID
          panel_urls: [] // Hybrid model: 0 panels stored in database
        });
      }

      if (chapterRows.length > 0) {
        await supabase.from('chapters').upsert(chapterRows, {
          onConflict: 'series_id, chapter_number'
        });
        console.log(`   -> Indexed ${chapterRows.length} chapters.`);
      }
    }
  } catch (err) {
    console.error('Sync failed:', err.message);
  }

  console.log('\n🚀 Catalog update complete.');
}

syncCatalog();
