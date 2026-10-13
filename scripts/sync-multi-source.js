const { createClient } = require('@supabase/supabase-js');
const { getMangaPlusChapters } = require('../lib/providers/mangaplus');
const { getScanGroupChapters } = require('../lib/providers/scangroups');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function syncMultiSourceCatalog() {
  console.log('⚡ Starting Multi-Platform Mirror Ingestion...');

  const { data: allSeries } = await supabase
    .from('series')
    .select('id, title, slug, source_url');

  for (const series of allSeries) {
    console.log(`\n🔍 Checking multi-sources for: "${series.title}"`);
    
    let extraChapters = [];

    // 1. Try MangaPlus for major Shonen Jump / official titles
    const mangaPlusChapters = await getMangaPlusChapters(series.title);
    if (mangaPlusChapters.length > 0) {
      console.log(`   └─ Found ${mangaPlusChapters.length} chapters on MangaPlus`);
      extraChapters.push(...mangaPlusChapters);
    }

    // 2. Try Asura / Temple scan groups if source_url has MD UUID
    const uuidMatch = series.source_url?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) {
      const asuraChaps = await getScanGroupChapters(uuidMatch[0], 'asura');
      if (asuraChaps.length > 0) {
        console.log(`   └─ Found ${asuraChaps.length} Asura Scans releases`);
        extraChapters.push(...asuraChaps);
      }
    }

    // 3. Upsert into Supabase
    if (extraChapters.length > 0) {
      const payload = extraChapters.map(c => ({
        series_id: series.id,
        chapter_number: c.chapter_number,
        title: c.title,
        source: c.source,
        source_provider: c.source_provider,
        panel_urls: []
      }));

      await supabase.from('chapters').upsert(payload, {
        onConflict: 'series_id, chapter_number'
      });
      console.log(`   └─ ✅ Upserted ${extraChapters.length} multi-source chapters.`);
    }
  }
}

syncMultiSourceCatalog();
