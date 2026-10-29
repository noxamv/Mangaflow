// Shim to bypass Node 20 WebSocket check for Supabase Realtime in GitHub Actions
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocket {};
}

import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = 
  process.env.SUPABASE_URL || 
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_KEY = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_SERVICE_KEY || 
  process.env.SUPABASE_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in environment.');
  console.error('Available env keys:', Object.keys(process.env).filter(k => k.includes('SUPA')));
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-');
}

// ==========================================
// 1. ADAPTER: MANGAPILL (Deep Link Extraction)
// ==========================================
async function scrapeMangaPill(targetUrl) {
  if (!targetUrl || targetUrl === 'placeholder' || !targetUrl.includes('mangapill.com')) {
    return { chapters: [], resolvedUrl: null, platform: 'mangapill' };
  }

  const chapters = [];
  try {
    const res = await fetch(targetUrl, { headers: HEADERS });
    if (res.status !== 200) return { chapters: [], resolvedUrl: null, platform: 'mangapill' };

    const html = await res.text();
    const $ = cheerio.load(html);

    $('a[href*="/chapters/"], #chapters a, .chapters-list a, div.grid-cols-1 a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      const match = text.match(/chapter\s*([\d.]+)/i) || href.match(/chapter-([\d.]+)/i) || href.match(/-([\d.]+)\/?$/);
      if (match && href) {
        const fullUrl = href.startsWith('http') ? href : `https://mangapill.com${href}`;
        const chNum = parseFloat(match[1]);
        if (!isNaN(chNum)) {
          chapters.push({
            chapter_number: chNum,
            title: text || `Chapter ${chNum}`,
            external_id: fullUrl,
            pages: [fullUrl]
          });
        }
      }
    });

    return { chapters, resolvedUrl: targetUrl, platform: 'mangapill' };
  } catch (err) {
    return { chapters: [], resolvedUrl: null, platform: 'mangapill' };
  }
}

// ==========================================
// 2. ADAPTER: MANGADEX (API Traverse with Fallback)
// ==========================================
async function scrapeMangaDex(targetUrl, seriesTitle) {
  if (!targetUrl || !targetUrl.includes('mangadex.org/title/')) {
    return { chapters: [], resolvedUrl: null, platform: 'mangadex' };
  }

  const match = targetUrl.match(/title\/([a-f0-9-]+)/);
  if (!match) return { chapters: [], resolvedUrl: null, platform: 'mangadex' };
  const mangaId = match[1];

  let offset = 0;
  const limit = 100;
  let total = 100;
  const chapters = [];

  try {
    // 1. Try English chapters with all content ratings explicitly allowed
    while (offset < total) {
      const apiUrl = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=${limit}&offset=${offset}&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
      const res = await fetch(apiUrl, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
      if (res.status !== 200) break;

      const json = await res.json();
      total = json.total || 0;
      const data = json.data || [];

      for (const item of data) {
        const chNum = parseFloat(item.attributes?.chapter);
        if (!isNaN(chNum)) {
          chapters.push({
            chapter_number: chNum,
            title: item.attributes?.title || `Chapter ${chNum}`,
            external_id: `mangadex:${item.id}`,
            pages: [`https://mangadex.org/chapter/${item.id}`]
          });
        }
      }

      offset += limit;
      await delay(250);
    }

    // 2. If English feed is empty (due to official delisting), check all translation feeds
    if (chapters.length === 0) {
      offset = 0;
      total = 100;
      while (offset < total && offset < 200) {
        const apiUrl = `https://api.mangadex.org/manga/${mangaId}/feed?order[chapter]=asc&limit=${limit}&offset=${offset}&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
        const res = await fetch(apiUrl, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
        if (res.status !== 200) break;

        const json = await res.json();
        total = json.total || 0;
        const data = json.data || [];

        for (const item of data) {
          const chNum = parseFloat(item.attributes?.chapter);
          if (!isNaN(chNum)) {
            chapters.push({
              chapter_number: chNum,
              title: item.attributes?.title || `Chapter ${chNum}`,
              external_id: `mangadex:${item.id}`,
              pages: [`https://mangadex.org/chapter/${item.id}`]
            });
          }
        }
        offset += limit;
        await delay(250);
      }
    }

    if (chapters.length > 0) {
      return { chapters, resolvedUrl: targetUrl, platform: 'mangadex' };
    }
  } catch (err) {
    // Continue to MangaPill search fallback
  }

  // 3. Fallback: Search MangaPill directly using the series title
  if (seriesTitle) {
    try {
      const searchRes = await fetch(`https://mangapill.com/search?q=${encodeURIComponent(seriesTitle)}`, { headers: HEADERS });
      if (searchRes.status === 200) {
        const searchHtml = await searchRes.text();
        const $ = cheerio.load(searchHtml);
        const firstMatchHref = $('a[href*="/manga/"]').first().attr('href');
        if (firstMatchHref) {
          const pillUrl = firstMatchHref.startsWith('http') ? firstMatchHref : `https://mangapill.com${firstMatchHref}`;
          const pillResult = await scrapeMangaPill(pillUrl);
          if (pillResult.chapters.length > 0) {
            return { chapters: pillResult.chapters, resolvedUrl: pillUrl, platform: 'mangapill' };
          }
        }
      }
    } catch {
      // Fall through to failure response
    }
  }

  return { chapters: [], resolvedUrl: null, platform: 'mangadex' };
}

// ==========================================
// 3. ADAPTER: MANHWATOP (Fallback Only)
// ==========================================
async function scrapeManhwatop(targetUrl, seriesTitle) {
  const chapters = [];
  const candidateUrls = targetUrl && targetUrl !== 'placeholder' && !targetUrl.includes('mangapill') && !targetUrl.includes('mangadex')
    ? [targetUrl]
    : [
        `https://manhwatop.com/manga/${slugify(seriesTitle)}-series/`,
        `https://manhwatop.com/manga/${slugify(seriesTitle)}/`
      ];

  let resolvedUrl = null;

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 200) {
        const html = await res.text();
        const $ = cheerio.load(html);

        $('.wp-manga-chapter a, li.wp-manga-chapter a').each((_, el) => {
          const href = $(el).attr('href');
          const text = $(el).text().trim();
          const match = text.match(/chapter\s*([\d.]+)/i) || href.match(/chapter-([\d.]+)/i);
          if (match && href) {
            const chNum = parseFloat(match[1]);
            if (!isNaN(chNum)) {
              chapters.push({
                chapter_number: chNum,
                title: text || `Chapter ${chNum}`,
                external_id: href,
                pages: [href]
              });
            }
          }
        });

        if (chapters.length > 0) {
          resolvedUrl = url;
          break;
        }
      }
    } catch {
      // Continue to next URL candidate
    }
  }

  return { chapters, resolvedUrl, platform: 'manhwatop' };
}

// ==========================================
// 4. WATERFALL ORCHESTRATION
// ==========================================
async function resolveAndIngestSeries(series) {
  const intel = Array.isArray(series.series_intel) 
    ? (series.series_intel[0] || {}) 
    : (series.series_intel || {});

  let targetUrl = intel.target_url;
  let platform = intel.source_platform;

  console.log(`\nAuditing: "${series.title}" [Platform: ${platform}]`);

  let result = { chapters: [], resolvedUrl: targetUrl, platform };

  // 1. Try MangaPill
  if (platform === 'mangapill' || targetUrl?.includes('mangapill')) {
    result = await scrapeMangaPill(targetUrl);
  }

  // 2. Try MangaDex
  if (result.chapters.length === 0 && (platform === 'mangadex' || targetUrl?.includes('mangadex'))) {
    result = await scrapeMangaDex(targetUrl, series.title);
  }

  // 3. Fallback to Manhwatop
  if (result.chapters.length === 0 && (platform === 'manhwatop' || targetUrl === 'placeholder' || !targetUrl)) {
    result = await scrapeManhwatop(targetUrl, series.title);
  }

  // If failed, advance timestamp to prevent getting stuck in a queue loop
  if (result.chapters.length === 0) {
    console.log(`  [FAILED] No chapters found for: "${series.title}". Advancing queue.`);
    const { error: updErr } = await supabase
      .from('series_intel')
      .update({ last_scouted_at: new Date().toISOString() })
      .eq('series_id', series.id);
    if (updErr) console.error(`  [WARN] Failed to touch timestamp: ${updErr.message}`);
    return;
  }

  // Deduplicate discovered chapters
  const uniqueMap = new Map();
  for (const ch of result.chapters) {
    if (!uniqueMap.has(ch.chapter_number)) {
      uniqueMap.set(ch.chapter_number, {
        series_id: series.id,
        chapter_number: ch.chapter_number,
        title: ch.title,
        external_id: ch.external_id,
        pages: ch.pages,
        updated_at: new Date().toISOString()
      });
    }
  }

  const payload = Array.from(uniqueMap.values());
  const maxCh = Math.max(...payload.map((c) => c.chapter_number));

  console.log(`  -> Found ${payload.length} chapters (Max: Ch. ${maxCh}). Syncing to Supabase...`);

  // Batch Upsert in chunks of 200
  const CHUNK_SIZE = 200;
  for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
    const chunk = payload.slice(i, i + CHUNK_SIZE);
    const { error: upsertErr } = await supabase
      .from('chapters')
      .upsert(chunk, { onConflict: 'series_id, chapter_number' });

    if (upsertErr) {
      console.error(`  [ERROR] Upserting chapters chunk: ${upsertErr.message}`);
    }
  }

  // Update Series Intel using explicit UPDATE by series_id
  const { error: intelErr } = await supabase
    .from('series_intel')
    .update({
      source_platform: result.platform,
      target_url: result.resolvedUrl || targetUrl,
      target_identifier: result.resolvedUrl?.split('/').filter(Boolean).pop() || '',
      latest_known_chapter: maxCh,
      last_scouted_at: new Date().toISOString()
    })
    .eq('series_id', series.id);

  if (intelErr) {
    console.error(`  [ERROR] Updating series_intel: ${intelErr.message}`);
  }

  console.log(`  [SUCCESS] Successfully synced ${series.title}`);
}

// ==========================================
// 5. MAIN EXECUTION LOOP
// ==========================================
async function main() {
  console.log('--- STARTING CATALOG WATERFALL SYNC ---');

  // Query series_intel directly so PostgREST sorts parent rows by last_scouted_at NULLS FIRST
  const { data: queue, error } = await supabase
    .from('series_intel')
    .select('series_id, source_platform, target_url, latest_known_chapter, last_scouted_at, series!inner(id, title)')
    .order('last_scouted_at', { ascending: true, nullsFirst: true })
    .limit(50);

  if (error) {
    console.error('Failed to fetch queue:', error.message);
    process.exit(1);
  }

  console.log(`Processing priority batch of ${queue.length} series...`);

  for (const item of queue) {
    const seriesPayload = {
      id: item.series?.id || item.series_id,
      title: item.series?.title || 'Unknown Title',
      series_intel: [{
        source_platform: item.source_platform,
        target_url: item.target_url,
        latest_known_chapter: item.latest_known_chapter,
        last_scouted_at: item.last_scouted_at
      }]
    };

    await resolveAndIngestSeries(seriesPayload);
    await delay(1200);
  }

  console.log('\n--- BATCH COMPLETED SUCCESSFULLY ---');
}

main().catch((err) => {
  console.error('Fatal crash:', err);
  process.exit(1);
});
