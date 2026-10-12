const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cheerio = require('cheerio');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment secrets.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function syncAsuraManhwa() {
  console.log('--- Scraping Asura Manhwa ---');
  try {
    const targetUrl = 'https://asuracomic.net/';
    const { data: html } = await axios.get(targetUrl, { headers, timeout: 10000 });
    const $ = cheerio.load(html);

    // Grab first 3 series links
    const seriesElements = $('div.grid a[href*="/series/"]').slice(0, 3).toArray();

    for (const el of seriesElements) {
      const link = $(el).attr('href');
      if (!link) continue;

      const seriesPageUrl = link.startsWith('http') ? link : `https://asuracomic.net${link}`;
      const title = $(el).find('span, h3, h2').first().text().trim() || 'Trending Manhwa';
      const coverUrl = $(el).find('img').attr('src') || '';
      const slug = seriesPageUrl.split('/').filter(Boolean).pop().replace(/[^a-z0-9]+/g, '-');

      // 1. Upsert Series Record
      const { data: seriesRow, error: sErr } = await supabase
        .from('series')
        .upsert(
          {
            slug,
            title,
            synopsis: `Read ${title} online on Manga Flow.`,
            cover_image_url: coverUrl,
            reading_mode: 'webtoon',
          },
          { onConflict: 'slug' }
        )
        .select()
        .single();

      if (sErr || !seriesRow) {
        console.error(`Failed to insert ${title}:`, sErr?.message);
        continue;
      }

      console.log(`Synced Series: ${title}`);

      // 2. Fetch series page for chapter link
      const { data: seriesHtml } = await axios.get(seriesPageUrl, { headers, timeout: 10000 });
      const $s = cheerio.load(seriesHtml);
      const chapterLink = $s('a[href*="/chapter/"]').first().attr('href');

      if (!chapterLink) continue;
      const chapterUrl = chapterLink.startsWith('http') ? chapterLink : `https://asuracomic.net${chapterLink}`;

      // 3. Fetch chapter page for panel URLs
      const { data: chHtml } = await axios.get(chapterUrl, { headers, timeout: 10000 });
      const $c = cheerio.load(chHtml);

      const panelUrls = [];
      $c('img').each((_, img) => {
        const src = $c(img).attr('src') \vert{}\vert{}$c(img).attr('data-src');
        if (src && (src.includes('asura') || src.includes('ggpht') || src.includes('.jpg') || src.includes('.webp'))) {
          if (!panelUrls.includes(src)) panelUrls.push(src);
        }
      });

      if (panelUrls.length > 0) {
        const match = chapterUrl.match(/chapter-(\d+(\.\d+)?)/i);
        const chapterNumber = match ? parseFloat(match[1]) : 1;

        await supabase.from('chapters').upsert(
          {
            series_id: seriesRow.id,
            chapter_number: chapterNumber,
            title: `Chapter ${chapterNumber}`,
            panel_urls: panelUrls,
          },
          { onConflict: 'series_id, chapter_number' }
        );

        console.log(`-> Added Chapter ${chapterNumber} (${panelUrls.length} panels) for ${title}`);
      }
    }
  } catch (err) {
    console.warn('Asura Scans request error:', err.message);
  }
}

async function run() {
  await syncAsuraManhwa();
  console.log('All scraper routines finished.');
}

run();
