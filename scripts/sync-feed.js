const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment secrets.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Fast axios instance with custom User-Agent
const api = axios.create({
  baseURL: 'https://api.mangadex.org',
  timeout: 8000,
  headers: { 'User-Agent': 'MangaFlowFastSync/2.0' }
});

async function fetchChapterPanels(chapterId) {
  try {
    const { data } = await api.get(`/at-home/server/${chapterId}`);
    const baseUrl = data.baseUrl;
    const hash = data.chapter.hash;
    // Uses data-saver for faster loading, fallback to standard data
    const files = data.chapter.dataSaver || data.chapter.data;
    const subFolder = data.chapter.dataSaver ? 'data-saver' : 'data';
    return files.map((f) => `${baseUrl}/${subFolder}/${hash}/${f}`);
  } catch {
    return [];
  }
}

async function fastSync() {
  console.log('⚡ Starting High-Speed Sync...');

  // 1. Fetch top 8 trending series
  const { data: res } = await api.get('/manga', {
    params: {
      limit: 8,
      'order[followedCount]': 'desc',
      'includes[]': ['cover_art'],
      'contentRating[]': ['safe', 'suggestive'],
      hasAvailableChapters: 'true',
    }
  });

  for (const item of res.data) {
    const mangaId = item.id;
    const title = item.attributes.title.en || Object.values(item.attributes.title)[0] || 'Untitled';
    const synopsis = item.attributes.description.en || 'Read online on Manga Flow.';
    const slug = (item.attributes.title.en || mangaId).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);

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

    if (sErr || !seriesRow) continue;
    console.log(`\n📚 Synced Series: ${title}`);

    // 2. Fetch up to 20 English chapters starting from Chapter 1 (ascending)
    const { data: feed } = await api.get(`/manga/${mangaId}/feed`, {
      params: {
        limit: 20,
        'translatedLanguage[]': ['en'],
        'order[chapter]': 'asc'
      }
    });

    const chapterItems = feed.data || [];
    console.log(`Found ${chapterItems.length} chapters. Fetching panels concurrently...`);

    // 3. Concurrent panel fetches (batches of 5 to respect rate limits)
    const chapterRows = [];
    const chunkSize = 5;

    for (let i = 0; i < chapterItems.length; i += chunkSize) {
      const slice = chapterItems.slice(i, i + chunkSize);

      const results = await Promise.allSettled(
        slice.map(async (ch) => {
          const chNumber = parseFloat(ch.attributes.chapter) || 1;
          const panels = await fetchChapterPanels(ch.id);
          if (panels.length === 0) return null;

          return {
            series_id: seriesRow.id,
            chapter_number: chNumber,
            title: ch.attributes.title || `Chapter ${chNumber}`,
            panel_urls: panels,
            source: 'mangadex'
          };
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          chapterRows.push(r.value);
        }
      }
    }

    // 4. Single bulk insert for all chapters of this series
    if (chapterRows.length > 0) {
      await supabase.from('chapters').upsert(chapterRows, {
        onConflict: 'series_id, chapter_number'
      });
      console.log(`✅ Bulk inserted ${chapterRows.length} chapters for ${title}`);
    }
  }

  console.log('\n🚀 High-speed sync finished successfully.');
}

fastSync();
