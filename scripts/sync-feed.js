const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment secrets.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncRealManga() {
  console.log('Fetching popular series from MangaDex...');

  try {
    // 1. Fetch a popular manhwa/manga (e.g. Solo Leveling / top-rated)
    const searchRes = await fetch('https://api.mangadex.org/manga?limit=1&order[rating]=desc&availableTranslatedLanguage[]=en');
    const searchData = await searchRes.json();

    if (!searchData.data || searchData.data.length === 0) {
      console.log('No series found.');
      return;
    }

    const manga = searchData.data[0];
    const mangaId = manga.id;
    const title = manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'Popular Series';
    const slug = manga.attributes.title.en
      ? manga.attributes.title.en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
      : 'featured-series';
    const synopsis = manga.attributes.description.en || 'Read the latest chapters online.';

    // 2. Insert or update the series in Supabase
    const { data: seriesRow, error: seriesError } = await supabase
      .from('series')
      .upsert({
        slug: slug,
        title: title,
        synopsis: synopsis.slice(0, 500),
        reading_mode: 'webtoon',
      }, { onConflict: 'slug' })
      .select()
      .single();

    if (seriesError) {
      console.error('Error upserting series:', seriesError.message);
      return;
    }

    console.log(`Synced Series: "${title}" (ID: ${seriesRow.id})`);

    // 3. Fetch latest English chapters for this manga
    const feedRes = await fetch(`https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=5`);
    const feedData = await feedRes.json();

    if (!feedData.data || feedData.data.length === 0) {
      console.log('No English chapters found for this series.');
      return;
    }

    // 4. Extract pages for the first available chapter
    for (const ch of feedData.data) {
      const chapterNumber = parseFloat(ch.attributes.chapter) || 1;
      const chapterTitle = ch.attributes.title || `Chapter ${chapterNumber}`;

      // Get server base URL and file tokens for image panels
      const atHomeRes = await fetch(`https://api.mangadex.org/at-home/server/${ch.id}`);
      const atHomeData = await atHomeRes.json();

      if (!atHomeData.chapter || !atHomeData.chapter.data) {
        continue;
      }

      const baseUrl = atHomeData.baseUrl;
      const hash = atHomeData.chapter.hash;
      const fileNames = atHomeData.chapter.data;

      // Construct direct CDN panel URLs (zero hosting cost)
      const panelUrls = fileNames.map(fileName => `${baseUrl}/data/${hash}/${fileName}`);

      // Insert chapter into Supabase
      const { error: chError } = await supabase
        .from('chapters')
        .upsert({
          series_id: seriesRow.id,
          chapter_number: chapterNumber,
          title: chapterTitle,
          panel_urls: panelUrls,
        }, { onConflict: 'series_id, chapter_number' });

      if (chError) {
        console.error(`Failed to insert chapter ${chapterNumber}:`, chError.message);
      } else {
        console.log(`Successfully added ${chapterTitle} (${panelUrls.length} pages)`);
        break; // Seed chapter complete
      }
    }
  } catch (err) {
    console.error('Sync failed:', err);
  }
}

syncRealManga();
