const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const MIRROR_API = axios.create({
  baseURL: 'https://api.comick.fun',
  timeout: 15000,
  headers: { 'User-Agent': 'MangaFlowAutoGapFiller/2.0' }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fallback search priorities if library is fresh
const SEED_TITLES = [
  'Lookism',
  'Shadow Slave',
  'Solo Leveling',
  'Omniscient Reader',
  'Nano Machine',
  'One Piece',
  'Jujutsu Kaisen',
  'Tower of God',
  'Wind Breaker'
];

async function fillCatalogGaps() {
  console.log('⚡ Starting Universal Gap-Filler Engine...');

  // 1. Fetch series from Supabase to inspect their chapter health
  const { data: allSeries, error } = await supabase
    .from('series')
    .select('id, title, slug')
    .order('followed_count', { ascending: false })
    .limit(80);

  if (error || !allSeries) {
    console.error('Failed to read series table:', error?.message);
    return;
  }

  // Combine database series titles with initial priority seeds
  const targetTitles = new Set([
    ...SEED_TITLES,
    ...allSeries.map((s) => s.title)
  ]);

  console.log(`📋 Inspecting ${targetTitles.size} priority titles for missing chapters...`);

  for (const rawTitle of targetTitles) {
    // Clean up title for mirror search (remove volume tags, sub-brackets)
    const cleanTitle = rawTitle.replace(/\([^)]*\)/g, '').trim();

    try {
      console.log(`\n🔍 Searching mirror for: "${cleanTitle}"...`);
      const { data: searchResults } = await MIRROR_API.get('/v1.0/search', {
        params: { q: cleanTitle, limit: 3 }
      });

      if (!searchResults || searchResults.length === 0) {
        console.log(`   └─ No mirror match found for "${cleanTitle}". Skipping.`);
        continue;
      }

      const match = searchResults[0];
      const hid = match.hid;
      const slug = (match.slug || cleanTitle)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);

      // 2. Ensure Series Record exists in Supabase
      let { data: seriesRow } = await supabase
        .from('series')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (!seriesRow) {
        const { data: detail } = await MIRROR_API.get(`/comic/${hid}`);
        const c = detail.comic;
        const synopsis = c.desc || 'Read online for free on MangaFlow.';
        const coverUrl = c.cover_url || (match.md_covers?.[0]?.b2key ? `https://meo.comick.pictures/${match.md_covers[0].b2key}` : null);
        const isWebtoon = c.country === 'kr' || c.country === 'cn' || c.is_webtoon;

        const { data: created, error: createErr } = await supabase
          .from('series')
          .upsert({
            slug,
            title: match.title,
            synopsis: synopsis.slice(0, 350),
            cover_image_url: coverUrl,
            reading_mode: isWebtoon ? 'webtoon' : 'manga',
            source: 'mirror',
            source_url: hid,
            followed_count: c.user_follow_count || 12000,
            views_count: 55000,
            rating: parseFloat((c.bayesian_rating || 9.0).toFixed(2))
          }, { onConflict: 'slug' })
          .select('id')
          .single();

        if (createErr || !created) {
          console.error(`   └─ Failed to create series entry:`, createErr?.message);
          continue;
        }
        seriesRow = created;
      }

      // 3. Fetch existing chapter numbers already in DB to identify gaps
      const { data: existingChapters } = await supabase
        .from('chapters')
        .select('chapter_number')
        .eq('series_id', seriesRow.id);

      const existingSet = new Set((existingChapters || []).map((c) => c.chapter_number));

      // 4. Pull all chapters from the mirror
      let page = 1;
      let allMirrorChapters = [];

      while (page <= 20) { // Up to 2,000 chapters
        try {
          const { data: chRes } = await MIRROR_API.get(`/comic/${hid}/chapters`, {
            params: { lang: 'en', page, limit: 100 }
          });
          const chapters = chRes.chapters || [];
          allMirrorChapters.push(...chapters);
          if (chapters.length < 100) break;
          page++;
          await sleep(150);
        } catch {
          break;
        }
      }

      // 5. Filter ONLY chapters missing from our DB
      const missingPayload = [];
      const seen = new Set();

      for (const ch of allMirrorChapters) {
        const rawNum = ch.chap;
        const num = rawNum ? parseFloat(rawNum) : null;
        if (num === null || isNaN(num) || seen.has(num)) continue;
        seen.add(num);

        // Only insert if the chapter doesn't already exist
        if (!existingSet.has(num)) {
          missingPayload.push({
            series_id: seriesRow.id,
            chapter_number: num,
            title: ch.title || `Chapter ${num}`,
            source: ch.hid,
            source_provider: 'mirror',
            panel_urls: []
          });
        }
      }

      if (missingPayload.length > 0) {
        for (let i = 0; i < missingPayload.length; i += 200) {
          const chunk = missingPayload.slice(i, i + 200);
          await supabase.from('chapters').upsert(chunk, {
            onConflict: 'series_id, chapter_number'
          });
        }
        console.log(`   └─ ✅ Filled ${missingPayload.length} missing chapters for "${cleanTitle}".`);
      } else {
        console.log(`   └─ ⚡ All chapters up-to-date for "${cleanTitle}". No gaps found.`);
      }

      await sleep(400);
    } catch (err) {
      console.error(`Error processing "${cleanTitle}":`, err.message);
    }
  }

  console.log('\n🚀 Gap-filling engine finished.');
}

fillCatalogGaps();
