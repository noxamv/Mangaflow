// scripts/sync-multi-source.js
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocket {};
}

import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[FATAL] Missing Supabase credentials in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache'
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanTitle(str) {
  return (str || '')
    .split(/[\n\r]/)[0]
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseChapterNumber(text, href) {
  const match = text?.match(/chapter\s*([\d.]+)/i) || href?.match(/chapter-([\d.]+)/i) || href?.match(/\/([\d.]+)$/);
  if (match) {
    const num = parseFloat(match[1]);
    if (!isNaN(num) && num >= 0 && num <= 5000) return num;
  }
  return null;
}

function isManhwa(series) {
  if (series.reading_mode === 'webtoon') return true;
  const t = (series.title || '').toLowerCase();
  return (
    t.includes('leveling') ||
    t.includes('reincarnat') ||
    t.includes('villainess') ||
    t.includes('player') ||
    t.includes('return') ||
    t.includes('ranker') ||
    t.includes('tower') ||
    t.includes('cultivat') ||
    t.includes('martial') ||
    t.includes('sword') ||
    t.includes('academy')
  );
}

// ---------------------------------------------------------------------------
// 1. ANILIST METADATA & STATUS TRUTH SOURCE
// ---------------------------------------------------------------------------
async function fetchAniListMetadata(title) {
  const query = `
    query ($search: String) {
      Media (search: $search, type: MANGA) {
        id
        status
        chapters
        format
        genres
        description(asHtml: false)
        coverImage { extraLarge large }
        title { english romaji }
      }
    }
  `;
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { search: cleanTitle(title) } }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    const media = json.data?.Media;
    if (!media) return null;

    let pubStatus = 'Ongoing';
    if (media.status === 'FINISHED') pubStatus = 'Completed';
    else if (media.status === 'HIATUS') pubStatus = 'Hiatus';

    return {
      status: pubStatus,
      officialChapters: media.chapters || null,
      coverUrl: media.coverImage?.extraLarge || media.coverImage?.large || null,
      description: media.description || '',
      genres: media.genres || [],
      isFinished: media.status === 'FINISHED'
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. WEEBCENTRAL SCRAPER (PAGINATED & ROBUST HEADERS)
// ---------------------------------------------------------------------------
async function scrapeWeebCentral(title) {
  try {
    const query = encodeURIComponent(cleanTitle(title));
    const searchUrl = `https://weebcentral.com/search/data?limit=12&offset=0&text=${query}&sort=Best+Match&order=Ascending&official=Any`;

    const searchRes = await fetch(searchUrl, {
      method: 'GET',
      headers: { ...BROWSER_HEADERS, 'HX-Request': 'true', Referer: 'https://weebcentral.com/search' },
      signal: AbortSignal.timeout(9000)
    });
    if (!searchRes.ok) return { chapters: [], platform: 'weebcentral' };

    const searchHtml = await searchRes.text();
    const $ = cheerio.load(searchHtml);
    const link = $('a[href*="/series/"]').first().attr('href');
    if (!link) return { chapters: [], platform: 'weebcentral' };

    const seriesUrl = link.startsWith('http') ? link : `https://weebcentral.com${link}`;
    const seriesId = link.match(/series\/([a-zA-Z0-9_-]+)/)?.[1];
    if (!seriesId) return { chapters: [], platform: 'weebcentral' };

    const chapsRes = await fetch(`https://weebcentral.com/series/${seriesId}/full-chapter-list`, {
      headers: { ...BROWSER_HEADERS, 'HX-Request': 'true', Referer: seriesUrl },
      signal: AbortSignal.timeout(12000)
    });
    if (!chapsRes.ok) return { chapters: [], platform: 'weebcentral' };

    const chapsHtml = await chapsRes.text();
    const $c = cheerio.load(chapsHtml);
    const chapters = [];

    $c('a[href*="/chapters/"]').each((_, el) => {
      const href = $c(el).attr('href');
      const text = $c(el).text().trim();
      const chNum = parseChapterNumber(text, href);

      if (chNum !== null && href) {
        const fullHref = href.startsWith('http') ? href : `https://weebcentral.com${href}`;
        chapters.push({
          chapter_number: chNum,
          title: text || `Chapter ${chNum}`,
          external_id: fullHref,
          pages: [fullHref],
          platform: 'weebcentral'
        });
      }
    });

    return { chapters, platform: 'weebcentral', resolvedUrl: seriesUrl };
  } catch {
    return { chapters: [], platform: 'weebcentral' };
  }
}

// ---------------------------------------------------------------------------
// 3. COMICK SCRAPER
// ---------------------------------------------------------------------------
async function scrapeComick(title) {
  const domains = ['https://api.comick.dev', 'https://api.comick.io', 'https://comick.io'];

  for (const base of domains) {
    try {
      const searchRes = await fetch(`${base}/v1.0/search?q=${encodeURIComponent(cleanTitle(title))}&limit=1`, {
        headers: { ...BROWSER_HEADERS, Referer: 'https://comick.io/' },
        signal: AbortSignal.timeout(8000)
      });
      if (!searchRes.ok) continue;

      const searchJson = await searchRes.json();
      const comic = Array.isArray(searchJson) ? searchJson[0] : null;
      if (!comic?.hid) continue;

      let page = 1;
      const chapters = [];

      while (page <= 25) {
        const chapRes = await fetch(`${base}/comic/${comic.hid}/chapters?lang=en&limit=100&page=${page}`, {
          headers: { ...BROWSER_HEADERS, Referer: 'https://comick.io/' },
          signal: AbortSignal.timeout(8000)
        });
        if (!chapRes.ok) break;

        const chapJson = await chapRes.json();
        const items = chapJson.chapters || [];
        if (items.length === 0) break;

        for (const item of items) {
          const chNum = parseFloat(item.chap);
          if (!isNaN(chNum) && chNum >= 0 && chNum <= 5000) {
            chapters.push({
              chapter_number: chNum,
              title: item.title ? `Chapter ${chNum} - ${item.title}` : `Chapter ${chNum}`,
              external_id: `comick:${item.hid}`,
              pages: [`https://comick.io/chapter/${item.hid}`],
              platform: 'comick'
            });
          }
        }
        page++;
        await delay(120);
      }

      if (chapters.length > 0) {
        return { chapters, platform: 'comick', resolvedUrl: `https://comick.io/comic/${comic.slug || comic.hid}` };
      }
    } catch {}
  }
  return { chapters: [], platform: 'comick' };
}

// ---------------------------------------------------------------------------
// 4. MANGAPILL SCRAPER (KEYWORD SPLIT FALLBACK)
// ---------------------------------------------------------------------------
async function scrapeMangaPill(targetUrl, title) {
  let url = targetUrl && targetUrl.includes('mangapill.com') ? targetUrl : null;

  if (!url) {
    const searchTerms = [cleanTitle(title), cleanTitle(title).split(' ').slice(0, 3).join(' ')];

    for (const term of searchTerms) {
      if (!term || term.length < 2) continue;
      try {
        const searchRes = await fetch(`https://mangapill.com/search?q=${encodeURIComponent(term)}`, {
          headers: BROWSER_HEADERS,
          signal: AbortSignal.timeout(8000)
        });
        if (searchRes.ok) {
          const html = await searchRes.text();
          const $ = cheerio.load(html);
          const match = $('a[href*="/manga/"]').first().attr('href');
          if (match) {
            url = match.startsWith('http') ? match : `https://mangapill.com${match}`;
            break;
          }
        }
      } catch {}
      await delay(200);
    }
  }

  if (!url) return { chapters: [], platform: 'mangapill' };

  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { chapters: [], platform: 'mangapill' };

    const html = await res.text();
    const $ = cheerio.load(html);
    const chapters = [];

    $('#chapters a[href*="/chapters/"], .chapters a, a[href*="/chapters/"]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      const chNum = parseChapterNumber(text, href);

      if (chNum !== null && href) {
        const fullHref = href.startsWith('http') ? href : `https://mangapill.com${href}`;
        chapters.push({
          chapter_number: chNum,
          title: text || `Chapter ${chNum}`,
          external_id: fullHref,
          pages: [fullHref],
          platform: 'mangapill'
        });
      }
    });

    return { chapters, platform: 'mangapill', resolvedUrl: url };
  } catch {
    return { chapters: [], platform: 'mangapill' };
  }
}

// ---------------------------------------------------------------------------
// 5. MANGADEX SCRAPER (AUTO-PAGINATED TO END)
// ---------------------------------------------------------------------------
async function scrapeMangaDex(targetUrl, title) {
  let mangaId = targetUrl?.match(/title\/([a-f0-9-]{36})/)?.[1];

  if (!mangaId) {
    try {
      const res = await fetch(
        `https://api.mangadex.org/manga?title=${encodeURIComponent(cleanTitle(title))}&limit=1&contentRating[]=safe&contentRating[]=suggestive`,
        { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) {
        const json = await res.json();
        mangaId = json.data?.[0]?.id;
      }
    } catch {}
  }

  if (!mangaId) return { chapters: [], platform: 'mangadex' };

  try {
    let offset = 0;
    const limit = 100;
    let total = Infinity;
    const chapters = [];

    while (offset < total) {
      const feedRes = await fetch(
        `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=${limit}&offset=${offset}&contentRating[]=safe&contentRating[]=suggestive`,
        { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) }
      );

      if (feedRes.status === 429) {
        await delay(2000);
        continue;
      }
      if (!feedRes.ok) break;

      const feedJson = await feedRes.json();
      total = feedJson.total || 0;
      const items = feedJson.data || [];
      if (items.length === 0) break;

      for (const item of items) {
        const chNum = parseFloat(item.attributes?.chapter);
        if (!isNaN(chNum) && chNum >= 0 && chNum <= 5000) {
          chapters.push({
            chapter_number: chNum,
            title: item.attributes?.title ? `Chapter ${chNum} - ${item.attributes.title}` : `Chapter ${chNum}`,
            external_id: `mangadex:${item.id}`,
            pages: [`https://mangadex.org/chapter/${item.id}`],
            platform: 'mangadex'
          });
        }
      }

      offset += limit;
      if (offset >= total) break;
      await delay(250);
    }

    return { chapters, platform: 'mangadex', resolvedUrl: `https://mangadex.org/title/${mangaId}` };
  } catch {
    return { chapters: [], platform: 'mangadex' };
  }
}

// ---------------------------------------------------------------------------
// 6. CATALOG EXPANDER (TRENDING DISCOVERY)
// ---------------------------------------------------------------------------
async function discoverNewSeries() {
  console.log('[DISCOVERY] Scouting AniList trending titles to expand catalog...');
  const query = `
    query {
      Page(page: 1, perPage: 10) {
        media(type: MANGA, sort: TRENDING_DESC, countryOfOrigin: "KR") {
          title { english romaji }
          status
          chapters
          description(asHtml: false)
          coverImage { extraLarge }
          genres
        }
      }
    }
  `;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return;
    const json = await res.json();
    const mediaList = json.data?.Page?.media || [];

    for (const item of mediaList) {
      const canonicalTitle = item.title.english || item.title.romaji;
      if (!canonicalTitle) continue;

      const slug = cleanTitle(canonicalTitle).replace(/\s+/g, '-');
      const { data: existing } = await supabase
        .from('series')
        .select('id')
        .or(`slug.eq.${slug},title.ilike.${canonicalTitle}`)
        .maybeSingle();

      if (!existing) {
        console.log(`[DISCOVERY] Ingesting new title: "${canonicalTitle}"`);
        const { data: inserted } = await supabase
          .from('series')
          .insert({
            title: canonicalTitle,
            slug,
            description: item.description || '',
            cover_url: item.coverImage?.extraLarge || '',
            status: item.status === 'FINISHED' ? 'Completed' : 'Ongoing',
            reading_mode: 'webtoon'
          })
          .select('id, slug')
          .single();

        if (inserted) {
          await supabase.from('series_intel').upsert(
            {
              series_id: inserted.id,
              slug: inserted.slug || slug,
              source_platform: 'unassigned',
              target_url: 'placeholder',
              next_scout_at: new Date().toISOString()
            },
            { onConflict: 'series_id' }
          );
        }
      }
    }
  } catch (err) {
    console.warn(`[WARN] Discovery Engine: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 7. MULTI-LANE STITCHING & ADAPTIVE SCHEDULING
// ---------------------------------------------------------------------------
async function resolveAndStitchSeries(series) {
  const intel = Array.isArray(series.series_intel) ? series.series_intel[0] || {} : series.series_intel || {};
  const title = series.title;
  const targetUrl = intel.target_url;
  const manhwaFlag = isManhwa(series);

  console.log(`\nAuditing: "${title}" [${manhwaFlag ? 'Webtoon/Manhwa' : 'Manga'}]`);

  const aniMeta = await fetchAniListMetadata(title);
  if (aniMeta?.status && aniMeta.status !== series.status) {
    await supabase.from('series').update({ status: aniMeta.status }).eq('id', series.id);
  }

  const [wcRes, cmRes, mpRes, mdRes] = await Promise.all([
    scrapeWeebCentral(title),
    scrapeComick(title),
    scrapeMangaPill(targetUrl, title),
    scrapeMangaDex(targetUrl, title)
  ]);

  const candidates = [wcRes, cmRes, mpRes, mdRes].filter((c) => c && c.chapters && c.chapters.length > 0);

  if (candidates.length === 0) {
    console.log(`  [FAILED] No chapters found on any provider for "${title}".`);
    await supabase.from('series_intel').upsert(
      {
        series_id: series.id,
        slug: series.slug,
        last_scouted_at: new Date().toISOString(),
        next_scout_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      { onConflict: 'series_id' }
    );
    return;
  }

  const providerPriority = manhwaFlag
    ? ['weebcentral', 'comick', 'mangapill', 'mangadex']
    : ['mangapill', 'mangadex', 'weebcentral', 'comick'];

  candidates.sort((a, b) => providerPriority.indexOf(a.platform) - providerPriority.indexOf(b.platform));

  const stitchedMap = new Map();
  for (const cand of candidates) {
    for (const ch of cand.chapters) {
      if (!stitchedMap.has(ch.chapter_number)) {
        stitchedMap.set(ch.chapter_number, {
          series_id: series.id,
          chapter_number: ch.chapter_number,
          title: ch.title,
          external_id: ch.external_id,
          pages: ch.pages,
          source: cand.platform,
          updated_at: new Date().toISOString()
        });
      }
    }
  }

  const payload = Array.from(stitchedMap.values());
  const maxCh = Math.max(...payload.map((c) => c.chapter_number));
  const primaryPlatform = candidates[0].platform;
  const primaryUrl = candidates[0].resolvedUrl || targetUrl || '';

  // Batch upsert chapters
  const CHUNK = 200;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const { error: upsertErr } = await supabase
      .from('chapters')
      .upsert(payload.slice(i, i + CHUNK), { onConflict: 'series_id,chapter_number' });

    if (upsertErr) {
      console.warn(`  [Upsert Warn]: ${upsertErr.message}`);
    }
  }

  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const currentStatus = aniMeta?.status || series.status;

  const isActuallyComplete =
    currentStatus === 'Completed' &&
    (aniMeta?.officialChapters ? maxCh >= aniMeta.officialChapters - 2 : payload.length >= 25);

  let nextInterval = ONE_DAY * 2;
  if (isActuallyComplete) {
    const isRecent = intel.completed_at && now - new Date(intel.completed_at).getTime() < 90 * ONE_DAY;
    nextInterval = isRecent ? ONE_DAY * 7 : ONE_DAY * 30;
  } else if (currentStatus === 'Completed') {
    nextInterval = ONE_DAY * 1;
  } else if (currentStatus === 'Hiatus') {
    nextInterval = ONE_DAY * 14;
  }

  await supabase.from('series_intel').upsert(
    {
      series_id: series.id,
      slug: series.slug,
      source_platform: primaryPlatform,
      target_url: primaryUrl,
      latest_known_chapter: maxCh,
      last_scouted_at: new Date().toISOString(),
      next_scout_at: new Date(now + nextInterval).toISOString(),
      is_complete: isActuallyComplete,
      total_official_chapters: aniMeta?.officialChapters || intel.total_official_chapters || null
    },
    { onConflict: 'series_id' }
  );

  console.log(
    `  [STITCHED] Ingested ${payload.length} chapters (Max: Ch. ${maxCh}) merged across ${candidates
      .map((c) => `${c.platform} (${c.chapters.length})`)
      .join(', ')}.`
  );
}

// ---------------------------------------------------------------------------
// 8. QUEUE AUDITOR ENTRYPOINT
// ---------------------------------------------------------------------------
async function main() {
  console.log('--- STAGE 2: MULTI-LANE GAP AUDITOR & BACKLOG STITCHER ---');

  try {
    const { error: healErr } = await supabase.rpc('fn_heal_catalog_queue');
    if (healErr) console.warn('[WARN] Queue Self-Heal RPC:', healErr.message);
    else console.log('[HEAL] Database queue self-healing completed.');
  } catch (err) {
    console.warn('[WARN] Queue Self-Heal skipped:', err.message);
  }

  await discoverNewSeries();

  const { data: queue, error } = await supabase
    .from('series')
    .select(`
      id,
      title,
      slug,
      reading_mode,
      status,
      series_intel(source_platform, target_url, last_scouted_at, next_scout_at, completed_at, is_complete, total_official_chapters)
    `)
    .limit(300);

  if (error || !queue) {
    console.error('[Queue Error]:', error?.message);
    process.exit(1);
  }

  const nowIso = new Date().toISOString();

  // Filter series due for a scout or missing intel entirely
  const dueSeries = queue.filter((s) => {
    const intel = Array.isArray(s.series_intel) ? s.series_intel[0] : s.series_intel;
    return !intel || !intel.next_scout_at || intel.next_scout_at <= nowIso;
  });

  dueSeries.sort((a, b) => {
    const intelA = Array.isArray(a.series_intel) ? a.series_intel[0] : a.series_intel;
    const intelB = Array.isArray(b.series_intel) ? b.series_intel[0] : b.series_intel;

    const unassignedA = !intelA?.source_platform || intelA.source_platform === 'unassigned' ? 0 : 1;
    const unassignedB = !intelB?.source_platform || intelB.source_platform === 'unassigned' ? 0 : 1;
    if (unassignedA !== unassignedB) return unassignedA - unassignedB;

    const timeA = intelA?.last_scouted_at ? new Date(intelA.last_scouted_at).getTime() : 0;
    const timeB = intelB?.last_scouted_at ? new Date(intelB.last_scouted_at).getTime() : 0;
    return timeA - timeB;
  });

  const batch = dueSeries.slice(0, 50);
  console.log(`Auditing top ${batch.length} prioritized series in this sweep...`);

  for (const s of batch) {
    try {
      await resolveAndStitchSeries(s);
    } catch (seriesErr) {
      console.error(`[ERROR] Failed to process "${s.title}":`, seriesErr.message);
    }
    await delay(600); // 600ms grace pause to avoid downstream IP bans
  }

  console.log('--- AUDITOR SWEEP BATCH COMPLETE ---');
}

main().catch((err) => {
  console.error('[FATAL]:', err);
  process.exit(1);
});
