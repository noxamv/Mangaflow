const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment secrets.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncMangaDexTrending() {
  console.log('--- Fetching Top Trending Manga/Manhwa from MangaDex API ---');
  try {
    // 1. Fetch top 8 popular/trending titles
    const res = await axios.get('https://api.mangadex.org/manga', {
      params: {
        limit: 8,
        'order[followedCount]': 'desc',
        'includes[]': ['cover_art'],
        'contentRating[]': ['safe', 'suggestive'],
        hasAvailableChapters: 'true',
      },
      headers: { 'User-Agent': 'MangaFlow/1.0' }
    });

    const mangaList = res.data.data;

    for (const item of mangaList) {
      const mangaId = item.id;
      const title = item.attributes.title.en || Object.values(item.attributes.title)[0] || 'Unknown Title';
      const synopsis = item.attributes.description.en || 'Read online on Manga Flow.';
      const slug = (item.attributes.title.en || mangaId).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);

      // Extract Cover Art
      let coverUrl = '';
      const coverRel = item.relationships.find((r) => r.type === 'cover_art');
      if (coverRel && coverRel.attributes && coverRel.attributes.fileName) {
        coverUrl = `https://uploads.mangadex.org/covers/${mangaId}/${coverRel.attributes.fileName}.512.jpg`;
      }

      // Upsert into Supabase series table
      const { data: seriesRow, error: sErr } = await supabase
        .from('series')
        .upsert(
          {
            slug,
            title,
            synopsis: synopsis.slice(0, 300),
            cover_image_url: coverUrl,
            reading_mode: 'manga',
            source: 'mangadex',
            source_url: `https://mangadex.org/title/${mangaId}`
          },
          { onConflict: 'slug' }
        )
        .select()
        .single();

      if (sErr || !seriesRow) {
        console.warn(`Failed series ${title}:`, sErr?.message);
        continue;
      }

      console.log(`Synced Series: ${title}`);

      // 2. Fetch latest 3 English chapters
      const chRes = await axios.get(`https://api.mangadex.org/manga/${mangaId}/feed`, {
        params: {
          limit: 3,
          'translatedLanguage[]': ['en'],
          'order[chapter]': 'desc'
        },
        headers: { 'User-Agent': 'MangaFlow/1.0' }
      });

      const chapters = chRes.data.data;

      for (const ch of chapters) {
        const chNumber = parseFloat(ch.attributes.chapter) || 1;
        const chId = ch.id;

        // Fetch direct panel images
        const atHomeRes = await axios.get(`https://api.mangadex.org/at-home/server/${chId}`);
        const baseUrl = atHomeRes.data.baseUrl;
        const hash = atHomeRes.data.chapter.hash;
        const pageFilenames = atHomeRes.data.chapter.data;

        const panelUrls = pageFilenames.map(
          (file) => `${baseUrl}/data/${hash}/${file}`
        );

        if (panelUrls.length > 0) {
          await supabase.from('chapters').upsert(
            {
              series_id: seriesRow.id,
              chapter_number: chNumber,
              title: ch.attributes.title || `Chapter ${chNumber}`,
              panel_urls: panelUrls,
              source: 'mangadex'
            },
            { onConflict: 'series_id, chapter_number' }
          );

          console.log(`-> Saved Chapter ${chNumber} (${panelUrls.length} panels)`);
        }
      }
    }
  } catch (err) {
    console.error('MangaDex sync error:', err.message);
  }
}

syncMangaDexTrending();
