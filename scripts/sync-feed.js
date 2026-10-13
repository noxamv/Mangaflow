const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MD_API = axios.create({
  baseURL: 'https://api.mangadex.org',
  timeout: 15000,
  headers: { 'User-Agent': 'MangaFlowIngester/2.0' }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runFeedSync() {
  console.log('⚡ Starting Latest Series & Chapter Discovery...');

  try {
    const res = await MD_API.get('/chapter', {
      params: {
        limit: 100,
        translatedLanguage: ['en'],
        order: { readableAt: 'desc' },
        includes: ['manga']
      }
    });

    const chapters = res.data?.data || [];
    console.log(`📋 Found ${chapters.length} recent chapter updates.`);

    for (const ch of chapters) {
      const mangaRel = ch.relationships?.find((r) => r.type === 'manga');
      if (!mangaRel) continue;

      const mangaId = mangaRel.id;
      const mangaTitle =
        mangaRel.attributes?.title?.en ||
        Object.values(mangaRel.attributes?.title || {})[0] ||
        'Unknown Title';

      const chapterNum = parseFloat(ch.attributes?.chapter);
      if (isNaN(chapterNum)) continue;

      // Ensure series exists in database
      const { data: existingSeries } = await supabase
        .from('series')
        .select('id')
        .eq('source_url', mangaId)
        .maybeSingle();

      let seriesDbId = existingSeries?.id;

      if (!seriesDbId) {
        const slug = mangaTitle
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-');

        const { data: newSeries, error: sErr } = await supabase
          .from('series')
          .insert({
            title: mangaTitle,
            slug: `${slug}-${mangaId.slice(0, 8)}`,
            source_url: mangaId,
            description: mangaRel.attributes?.description?.en || ''
          })
          .select('id')
          .single();

        if (sErr) continue;
        seriesDbId = newSeries.id;
        console.log(`✨ Added new series: "${mangaTitle}"`);
      }

      // Upsert latest chapter
      await supabase.from('chapters').upsert({
        series_id: seriesDbId,
        chapter_number: chapterNum,
        title: ch.attributes?.title || `Chapter ${chapterNum}`,
        source: ch.id,
        source_provider: 'mangadex',
        panel_urls: []
      }, {
        onConflict: 'series_id, chapter_number'
      });
    }

    console.log('✅ Latest release discovery complete.');
  } catch (err) {
    console.error('Error during feed ingestion:', err.message);
  }
}

runFeedSync();
