const { createClient } = require('@supabase/supabase-js');

// 1. Resolve Supabase credentials with multi-alias fallbacks
const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY;

if (!supabaseUrl) {
  console.error('❌ Critical Error: Supabase URL is missing.');
  console.error('Ensure SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is defined in GitHub Repository Secrets.');
  process.exit(1);
}

if (!supabaseKey) {
  console.error('❌ Critical Error: Supabase Key is missing.');
  console.error('Ensure SUPABASE_SERVICE_ROLE_KEY is defined in GitHub Repository Secrets.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// 2. Sample multi-source sync engine
async function syncCatalog() {
  console.log('🚀 Starting MangaFlow multi-source catalog sync...');

  try {
    // Fetch series needing cover or details
    const { data: seriesList, error: seriesError } = await supabase
      .from('series')
      .select('id, title, slug, cover_url');

    if (seriesError) {
      throw new Error(`Failed to query series: ${seriesError.message}`);
    }

    console.log(`📚 Found ${seriesList ? seriesList.length : 0} series in database.`);

    // Check chapters needing image extraction
    const { data: emptyChapters, error: chapterError } = await supabase
      .from('chapters')
      .select('id, series_id, chapter_number, pages')
      .or('pages.is.null,pages.eq.[]');

    if (chapterError) {
      console.warn(`Warning reading chapters: ${chapterError.message}`);
    } else {
      console.log(`📑 Found ${emptyChapters ? emptyChapters.length : 0} chapters awaiting panel sync.`);
    }

    console.log('✅ Scraper sync cycle finished cleanly.');
  } catch (err) {
    console.error('❌ Sync script encountered an error:', err.message);
    process.exit(1);
  }
}

syncCatalog();
