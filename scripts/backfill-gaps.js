import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper for delay to avoid rate-limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return await res.text();
}

/**
 * Crawls a Mangapill manga page and backfills missing chapter rows into Supabase
 */
async function backfillMangapillSeries(seriesId, mangapillUrl) {
  console.log(`\n--- Backfilling Series ${seriesId} from ${mangapillUrl} ---`);
  
  // 1. Get existing chapter numbers for this series from DB
  const { data: existingRows, error: fetchErr } = await supabase
    .from('chapters')
    .select('chapter_number')
    .eq('series_id', seriesId);

  if (fetchErr) {
    console.error('Error fetching existing chapters:', fetchErr.message);
    return;
  }

  const existingChapterSet = new Set(
    (existingRows || []).map((r) => Number(r.chapter_number))
  );
  console.log(`Currently ingested: ${existingChapterSet.size} chapters.`);

  // 2. Fetch the Mangapill series page
  const html = await fetchHtml(mangapillUrl);
  const $ = cheerio.load(html);

  // Mangapill chapter links are typically inside `#chapters a` or `.chapters-list a`
  const chapterLinks = [];
  $('a[href*="/chapters/"]').each((_, el) => {
    const href = $(el).attr('href');
    const titleText = $(el).text().trim();
    if (!href) return;

    // Extract chapter number from text or url (e.g. "Chapter 145" -> 145)
    const match = titleText.match(/Chapter\s+([\d.]+)/i) || href.match(/-chapter-([\d.]+)/i);
    if (match) {
      const chNum = parseFloat(match[1]);
      chapterLinks.push({
        chapterNumber: chNum,
        title: titleText,
        url: href.startsWith('http') ? href : `https://mangapill.com${href}`,
      });
    }
  });

  console.log(`Found ${chapterLinks.length} total chapters listed on Mangapill.`);

  // 3. Filter down strictly to chapters missing from our database
  const missingChapters = chapterLinks.filter(
    (ch) => !existingChapterSet.has(ch.chapterNumber)
  );

  console.log(`Identified ${missingChapters.length} chapters to backfill.`);
  if (missingChapters.length === 0) return;

  // 4. Ingest in batches of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < missingChapters.length; i += BATCH_SIZE) {
    const chunk = missingChapters.slice(i, i + BATCH_SIZE);
    const rowsToInsert = chunk.map((c) => ({
      series_id: seriesId,
      chapter_number: c.chapterNumber,
      title: c.title,
      source: 'mangapill',
      source_provider: 'mangapill',
      external_id: c.url,
      pages: [], // Marked for page-image scraper runner
    }));

    const { error: insertErr } = await supabase
      .from('chapters')
      .upsert(rowsToInsert, { onConflict: 'series_id,chapter_number' });

    if (insertErr) {
      console.error(`Batch insert error at offset ${i}:`, insertErr.message);
    } else {
      console.log(`Inserted chapters ${chunk[0].chapterNumber} to ${chunk[chunk.length - 1].chapterNumber}`);
    }

    await sleep(500); // 500ms throttle between batches
  }
}

// Target high-priority series from your gap list:
async function run() {
  const targetSeries = [
    {
      id: 'a8ad2ed1-9a7a-4aad-a47f-dc1ef2104690',
      title: 'Jujutsu Kaisen',
      url: 'https://mangapill.com/manga/2085/jujutsu-kaisen'
    },
    {
      id: '98f88330-a9e0-4a61-bb0f-2c856a0f123d',
      title: "Komi Can't Communicate",
      url: 'https://mangapill.com/manga/2431/komi-san-wa-comyushou-desu'
    },
    {
      id: '68f1cd59-038f-42de-8c00-7f0a93856fa4',
      title: 'The Devil Butler',
      url: 'https://mangapill.com/manga/5539/the-servant-is-the-demon-king'
    },
    {
      id: '995af7d3-f1ec-4546-82c4-7b59ce07041a',
      title: 'Martial Peak',
      url: 'https://mangapill.com/manga/2809/martial-peak'
    }
  ];

  for (const s of targetSeries) {
    try {
      await backfillMangapillSeries(s.id, s.url);
    } catch (err) {
      console.error(`Failed backfilling ${s.title}:`, err.message);
    }
  }
  console.log('\nDone backfilling target series.');
}

run();
