const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment secrets.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncMangaLibrary() {
  console.log('Fetching top manga series list from MangaDex...');

  try {
    // Fetch top 6 popular titles
    const searchRes = await fetch(
      'https://api.mangadex.org/manga?limit=6&order[followedCount]=desc&availableTranslatedLanguage[]=en&includes[]=cover_art'
    );
    const searchData = await searchRes.json();

    if (!searchData.data) return;

    for (const manga of searchData.data) {
      const mangaId = manga.id;
      const title = manga.attributes.title.en || Object.values(manga.attributes.title)[0] || 'Popular Series';
      const slug = (manga.attributes.title.en || mangaId)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      const synopsis = manga.attributes.description?.en || 'Read chapters online in high quality.';

      // Extract cover image
      const coverRel = manga.relationships.find((r) => r.type === 'cover_art');
      const coverFile = coverRel?.attributes?.fileName;
      const coverUrl = coverFile
        ? `https://uploads.mangadex.org/covers/${mangaId}/${coverFile}.256.jpg`
        : 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=80';

      // Determine default layout mode
      const isLongStrip = manga.attributes.tags?.some((t) => t.attributes?.name?.en === 'Long Strip');
      const readingMode = isLongStrip ? 'webtoon' : 'manga';

      // 1. Upsert Series
      const { data: seriesRow, error: sErr } = await supabase
        .from('series')
        .upsert(
          {
            slug,
            title,
            synopsis: synopsis.slice(0, 400),
            cover_image_url: coverUrl,
            reading_mode: readingMode,
          },
          { onConflict: 'slug' }
        )
        .select()
        .single();

      if (sErr || !seriesRow) {
        console.error(`Failed upserting ${title}:`, sErr?.message);
        continue;
      }

      console.log(`Synced Series: ${title}`);

      // 2. Fetch Latest Chapter for this Series
      const feedRes = await fetch(
        `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=1`
      );
      const feedData = await feedRes.json();

      if (!feedData.data || feedData.data.length === 0) continue;

      const ch = feedData.data[0];
      const chNum = parseFloat(ch.attributes.chapter) || 1;
      const chTitle = ch.attributes.title || `Chapter ${chNum}`;

      const atHomeRes = await fetch(`https://api.mangadex.org/at-home/server/${ch.id}`);
      const atHomeData = await atHomeRes.json();

      if (!atHomeData.chapter?.data) continue;

      const baseUrl = atHomeData.baseUrl;
      const hash = atHomeData.chapter.hash;
      const panelUrls = atHomeData.chapter.data.map((file) => `${baseUrl}/data/${hash}/${file}`);

      // 3. Upsert Chapter
      await supabase.from('chapters').upsert(
        {
          series_id: seriesRow.id,
          chapter_number: chNum,
          title: chTitle,
          panel_urls: panelUrls,
        },
        { onConflict: 'series_id, chapter_number' }
      );

      console.log(`-> Added ${chTitle} (${panelUrls.length} pages) for ${title}`);
    }

    console.log('Library sync completed.');
  } catch (err) {
    console.error('Sync failed:', err);
  }
}

syncMangaLibrary();
