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
    const response = await axios.get(targetUrl, { headers: headers, timeout: 10000 });
    const $ = cheerio.load(response.data);

    const seriesElements = $('div.grid a[href*="/series/"]').slice(0, 3).toArray();

    for (const el of seriesElements) {
      let link = $(el).attr('href');
      if (!link) continue;

      let seriesPageUrl = link;
      if (!seriesPageUrl.startsWith('http')) {
        seriesPageUrl = 'https://asuracomic.net' + link;
      }

      let title = $(el).find('span, h3, h2').first().text().trim();
      if (!title) title = 'Trending Manhwa';

      let coverUrl = $(el).find('img').attr('src');
      if (!coverUrl) coverUrl = '';

      const slugParts = seriesPageUrl.split('/').filter(Boolean);
      const rawSlug = slugParts[slugParts.length - 1];
      const slug = rawSlug.replace(/[^a-z0-9]+/g, '-');

      const { data: seriesRow, error: sErr } = await supabase
        .from('series')
        .upsert(
          {
            slug: slug,
            title: title,
            synopsis: 'Read ' + title + ' online on Manga Flow.',
            cover_image_url: coverUrl,
            reading_mode: 'webtoon',
          },
          { onConflict: 'slug' }
        )
        .select()
        .single();

      if (sErr || !seriesRow) {
        console.error('Failed to insert ' + title + ':', sErr ? sErr.message : 'Unknown error');
        continue;
      }

      console.log('Synced Series: ' + title);

      const seriesPageRes = await axios.get(seriesPageUrl, { headers: headers, timeout: 10000 });
      const $s = cheerio.load(seriesPageRes.data);
      let chapterLink = $s('a[href*="/chapter/"]').first().attr('href');

      if (!chapterLink) continue;

      let chapterUrl = chapterLink;
      if (!chapterUrl.startsWith('http')) {
        chapterUrl = 'https://asuracomic.net' + chapterLink;
      }

      const chPageRes = await axios.get(chapterUrl, { headers: headers, timeout: 10000 });
      const $c = cheerio.load(chPageRes.data);

      const panelUrls = [];
      $c('img').each(function (_, img) {
        let src = $c(img).attr('src');
        if (!src) {
          src = $c(img).attr('data-src');
        }

        if (src) {
          const isTargetImg = src.includes('asura') || src.includes('ggpht') || src.includes('.jpg') || src.includes('.webp');
          if (isTargetImg && !panelUrls.includes(src)) {
            panelUrls.push(src);
          }
        }
      });

      if (panelUrls.length > 0) {
        const match = chapterUrl.match(/chapter-(\d+(\.\d+)?)/i);
        let chapterNumber = 1;
        if (match && match[1]) {
          chapterNumber = parseFloat(match[1]);
        }

        await supabase.from('chapters').upsert(
          {
            series_id: seriesRow.id,
            chapter_number: chapterNumber,
            title: 'Chapter ' + chapterNumber,
            panel_urls: panelUrls,
          },
          { onConflict: 'series_id, chapter_number' }
        );

        console.log('-> Added Chapter ' + chapterNumber + ' (' + panelUrls.length + ' panels) for ' + title);
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
