const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncRealManga() {
  console.log('Querying top rated manga from MangaDex API...');

  try {
    // 1. Fetch top rated series with English translations
    const searchRes = await fetch(
      'https://api.mangadex.org/manga?limit=5&order[rating]=desc&availableTranslatedLanguage[]=en'
    );
    const searchData = await searchRes.json();

    if (!searchData.data || searchData.data.length === 0) {
      console.log('No series returned from MangaDex API.');
      return;
    }

    const manga = searchData.data[0];
    const mangaId = manga.id;
    const title = manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'Featured Manga';
    const slug = (manga.attributes.title.en || 'manga-series')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    const synopsis = manga.attributes.description?.en || 'Read high-resolution webtoon and manga chapters online.';

    // 2. Upsert the series record into Supabase
    const { data: seriesRow, error: seriesError } = await supabase
      .from('series')
      .upsert(
        {
          slug: slug,
          title: title,
          synopsis: synopsis.slice(0, 500),
          reading_mode: 'webtoon',
        },
        { onConflict: 'slug' }
      )
      .select()
      .single();

    if (seriesError) {
      console.error('Failed to upsert series:', seriesError.message);
      return;
    }

    console.log(`Stored Series: "${title}" (ID: ${seriesRow.id})`);

    // 3. Fetch chapter feed for this series
    const feedRes = await fetch(
      `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=5`
    );
    const feedData = await feedRes.json();

    if (!feedData.data || feedData.data.length === 0) {
      console.log('No English chapters available for this series.');
      return;
    }

    // 4. Fetch page panels for each chapter and insert into database
    for (const ch of feedData.data) {
      const chapterNumber = parseFloat(ch.attributes.chapter) || 1;
      const chapterTitle = ch.attributes.title || `Chapter ${chapterNumber}`;

      const atHomeRes = await fetch(`https://api.mangadex.org/at-home/server/${ch.id}`);
      const atHomeData = await atHomeRes.json();

      if (!atHomeData.chapter || !atHomeData.chapter.data) {
        continue;
      }

      const baseUrl = atHomeData.baseUrl;
      const hash = atHomeData.chapter.hash;
      const fileNames = atHomeData.chapter.data;

      const panelUrls = fileNames.map((fileName) => `${baseUrl}/data/${hash}/${fileName}`);

      const { error: chError } = await supabase.from('chapters').upsert(
        {
          series_id: seriesRow.id,
          chapter_number: chapterNumber,
          title: chapterTitle,
          panel_urls: panelUrls,
        },
        { onConflict: 'series_id, chapter_number' }
      );

      if (chError) {
        console.error(`Error saving chapter ${chapterNumber}:`, chError.message);
      } else {
        console.log(`Successfully synced ${chapterTitle} with ${panelUrls.length} pages.`);
      }
    }

    console.log('Sync process completed successfully.');
  } catch (err) {
    console.error('Unexpected error running sync:', err);
  }
}

syncRealManga();
