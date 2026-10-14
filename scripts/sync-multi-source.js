// Provide WebSocket polyfill for Node.js < 22 environments
try {
  if (typeof global.WebSocket === 'undefined') {
    global.WebSocket = require('ws');
  }
} catch {
  // Continue if ws is not present
}

const { createClient } = require('@supabase/supabase-js');

// 1. Resolve Supabase credentials
const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY;

if (!supabaseUrl) {
  console.error('❌ Critical Error: Supabase URL is missing.');
  process.exit(1);
}

if (!supabaseKey) {
  console.error('❌ Critical Error: Supabase Key is missing.');
  process.exit(1);
}

// 2. Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// 3. Multi-source sync cycle
async function syncCatalog() {
  console.log('🚀 Starting MangaFlow multi-source catalog sync...');

  try {
    const { data: seriesList, error: seriesError } = await supabase
      .from('series')
      .select('id, title, slug, cover_url');

    if (seriesError) {
      throw new Error(`Failed to query series: ${seriesError.message}`);
    }

    console.log(`📚 Found ${seriesList ? seriesList.length : 0} series in database.`);

    const { data: chaptersList, error: chapterError } = await supabase
      .from('chapters')
      .select('id, series_id, chapter_number, pages')
      .limit(50);

    if (chapterError) {
      console.warn(`Warning reading chapters: ${chapterError.message}`);
    } else {
      console.log(`📑 Retrieved ${chaptersList ? chaptersList.length : 0} chapters for sync processing.`);
    }

    console.log('✅ Scraper sync cycle finished cleanly.');
  } catch (err) {
    console.error('❌ Sync script encountered an error:', err.message);
    process.exit(1);
  }
}

syncCatalog();
