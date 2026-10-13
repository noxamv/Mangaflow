const { createClient } = require('@supabase/supabase-js');
const { getMangaPlusChapters } = require('../lib/providers/mangaplus');
const { getScanGroupChapters } = require('../lib/providers/scangroups');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function syncMultiSourceCatalog() {
  console.log('⚡ Starting Extended Providers Ingestion (MangaPlus & Scans)...');

  const { data: allSeries } = await supabase
    .from('series')
    .select('id, title, slug, source_url');

  if (!allSeries) return;

  for (const series of allSeries) {
    const extraChapters = [];

    // 1. MangaPlus check
    const mpChapters = await getMangaPlusChapters(series.title);
    if (mpChapters.length > 0) {
      extraChapters.push(...mpChapters);
    }

    // 2. Scan Groups check via UUID
    const uuidMatch = series.source_url?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) {
      const mangaUuid = uuidMatch[0];
      const asura = await getScanGroupChapters(mangaUuid, 'asura');
      const temple = await getScanGroupChapters(mangaUuid, 'temple');
      const hive = await getScanGroupChapters(mangaUuid, 'hive');

      extraChapters.push(...asura, ...temple, ...hive);
    }

    if (extraChapters.length > 0) {
      const payload = extraChapters.map((c) => ({
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
      console.log(`   └─ [${series.title}] Ingested ${extraChapters.length} group/official chapters.`);
    }
  }

  console.log('🎉 Multi-source ingestion complete.');
}

syncMultiSourceCatalog();
