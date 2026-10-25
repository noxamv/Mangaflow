// scripts/scout-intel.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

async function safeFetchJson(url, referer = 'https://www.google.com/') {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, 'Accept': 'application/json', 'Referer': referer },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function safeFetchHtml(url, referer = 'https://www.google.com/') {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, 'Referer': referer },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

function cleanNum(str) {
  if (!str) return null;
  const match = String(str).match(/[0-9]+(?:\.[0-9]+)?/);
  return match ? parseFloat(match[0]) : null;
}

function isNovel(text) {
  if (!text) return false;
  const l = text.toLowerCase();
  return (
    l.includes('[novel]') ||
    l.includes('(novel)') ||
    l.includes('webnovel') ||
    l.includes('light novel') ||
    l.includes('[ln]') ||
    l.includes('[wn]')
  );
}

// ============================================================================
// LAYER 1: ANILIST AUTHORITATIVE GROUND-TRUTH ANCHOR
// ============================================================================
async function fetchAniListMetadata(title) {
  const query = `
    query ($search: String) {
      Media (search: $search, type: MANGA) {
        id
        title {
          romaji
          english
          native
        }
        format
        status
        chapters
        synonyms
        countryOfOrigin
      }
    }
  `;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables: { search: title } }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const json = await res.json();
    const media = json?.data?.Media;
    if (!media) return null;

    // Strict filter: Reject pure novels if AniList categorizes it as NOVEL
    if (media.format === 'NOVEL') return null;

    return {
      format: media.format, // MANGA, ONE_SHOT
      status: media.status, // FINISHED, RELEASING, NOT_YET_RELEASED
      maxOfficialChapters: media.chapters || null,
      englishTitle: media.title?.english || null,
      romajiTitle: media.title?.romaji || null,
      synonyms: Array.isArray(media.synonyms) ? media.synonyms : [],
    };
  } catch {
    return null;
  }
}

// ============================================================================
// LAYER 2: LEVENSHTEIN & TOKEN SIMILARITY GUARD
// ============================================================================
function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function isHighPrecisionMatch(queryTitle, candidateTitle) {
  if (!queryTitle || !candidateTitle) return false;
  if (isNovel(candidateTitle)) return false;

  const q = queryTitle.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const c = candidateTitle.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  if (q === c) return true;

  const qTokens = q.split(' ').filter((w) => w.length > 1);
  const cTokens = c.split(' ').filter((w) => w.length > 1);

  if (!qTokens.length || !cTokens.length) return false;

  // Intersect tokens
  const matchedTokens = qTokens.filter((token) => cTokens.includes(token));
  const tokenRecall = matchedTokens.length / qTokens.length;

  // Penalty check: If candidate includes high-frequency novel or diverged sequel tokens
  const extraTokens = cTokens.filter((token) => !qTokens.includes(token));
  const penaltyWords = ['double', 'reboot', 'side', 'after', 'anthology', 'novel'];
  const hasDisqualifyingWord = extraTokens.some((t) => penaltyWords.includes(t));

  if (hasDisqualifyingWord) return false;

  const maxLen = Math.max(q.length, c.length);
  const dist = levenshteinDistance(q, c);
  const stringSimilarity = 1 - dist / maxLen;

  // Accept if token recall >= 85% or string similarity >= 85%
  return tokenRecall >= 0.85 || stringSimilarity >= 0.85;
}

// ============================================================================
// LAYER 3: MULTI-SOURCE HARVESTERS
// ============================================================================

// 1. HIVETOONS
async function harvestHiveToons(searchTerms, slug) {
  const candidateSlugs = [slug, slug?.replace(/-/g, ''), ...searchTerms.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '-'))];
  for (const s of [...new Set(candidateSlugs.filter(Boolean))]) {
    const url = `https://hivetoons.org/series/${s}`;
    const html = await safeFetchHtml(url, 'https://hivetoons.org/');
    if (!html || html.includes('404 Not Found') || !html.includes('chapter-')) continue;

    const chapters = [];
    const regex = /href=["'](https?:\/\/hivetoons\.org\/series\/[^"']*\/chapter-([0-9]+(?:\.[0-9]+)?)[^"']*)["']/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const num = cleanNum(match[2]);
      if (num !== null) chapters.push({ chNum: num, url: match[1], title: `Chapter ${num}` });
    }
    if (chapters.length > 0) return { url, chapters };
  }
  return null;
}

// 2. ASURA SCANS
async function harvestAsura(searchTerms, slug) {
  const candidateSlugs = [slug, ...searchTerms.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '-'))];
  for (const s of [...new Set(candidateSlugs.filter(Boolean))]) {
    const url = `https://asurascans.com/series/${s}`;
    const html = await safeFetchHtml(url, 'https://asurascans.com/');
    if (!html || !html.includes('chapter/')) continue;

    const chapters = [];
    const regex = /href=["'](https?:\/\/asurascans\.com\/series\/[^"']*\/chapter\/([0-9]+(?:\.[0-9]+)?)[^"']*)["']/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const num = cleanNum(match[2]);
      if (num !== null) chapters.push({ chNum: num, url: match[1], title: `Chapter ${num}` });
    }
    if (chapters.length > 0) return { url, chapters };
  }
  return null;
}

// 3. FLAME COMICS
async function harvestFlameComics(searchTerms, slug) {
  const candidateSlugs = [slug, ...searchTerms.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '-'))];
  for (const s of [...new Set(candidateSlugs.filter(Boolean))]) {
    const url = `https://flamecomics.me/series/${s}`;
    const html = await safeFetchHtml(url, 'https://flamecomics.me/');
    if (!html || !html.includes('chapter/')) continue;

    const chapters = [];
    const regex = /href=["'](https?:\/\/flamecomics\.me\/series\/[^"']*\/chapter\/([0-9]+(?:\.[0-9]+)?)[^"']*)["']/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const num = cleanNum(match[2]);
      if (num !== null) chapters.push({ chNum: num, url: match[1], title: `Chapter ${num}` });
    }
    if (chapters.length > 0) return { url, chapters };
  }
  return null;
}

// 4. MANGANATO / MANGABAT MIRROR RING
async function harvestMangaNato(searchTerms) {
  const mirrorHosts = ['https://natomanga.com', 'https://chapmanganato.to', 'https://manganato.com'];

  for (const term of searchTerms) {
    if (!term || isNovel(term)) continue;
    const clean = term.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');

    for (const host of mirrorHosts) {
      const searchUrl = `${host}/search/story/${encodeURIComponent(clean.toLowerCase())}`;
      const html = await safeFetchHtml(searchUrl, host);
      if (!html) continue;

      const linkRegex = /href="(https:\/\/[^"]*(?:manganato|mangabat|natomanga)\.com\/[^"]*(?:manga|story)-[^"]+)"[^>]*title="([^"]+)"/gi;
      let match = linkRegex.exec(html);

      if (!match) continue;

      const mangaUrl = match[1];
      const candidateTitle = match[2] || '';
      if (!isHighPrecisionMatch(term, candidateTitle)) continue;

      const pageHtml = await safeFetchHtml(mangaUrl, host);
      if (!pageHtml) continue;

      const chapters = [];
      const regex = /href="(https:\/\/[^"]*\/chapter-([0-9]+(?:\.[0-9]+)?)[^"]*)"/gi;
      let m;
      while ((m = regex.exec(pageHtml)) !== null) {
        const num = cleanNum(m[2]);
        if (num !== null) chapters.push({ chNum: num, url: m[1], title: `Chapter ${num}` });
      }

      if (chapters.length > 0) return { url: mangaUrl, chapters };
    }
  }
  return null;
}

// 5. COMICK
async function harvestComicK(searchTerms) {
  for (const term of searchTerms) {
    if (!term || isNovel(term)) continue;
    const clean = term.replace(/['’]/g, '').trim();

    const search = await safeFetchJson(
      `https://api.comick.io/v1.0/search?q=${encodeURIComponent(clean)}&limit=5&type=comic`,
      'https://comick.io/'
    );
    if (!Array.isArray(search) || !search.length) continue;

    const comic = search.find(
      (c) => c.comic_type !== 'novel' && !isNovel(c.title) && isHighPrecisionMatch(clean, c.title)
    );
    if (!comic?.hid) continue;

    const chapters = [];
    let page = 1;
    while (page <= 35) {
      const json = await safeFetchJson(
        `https://api.comick.io/comic/${comic.hid}/chapters?lang=en&page=${page}&limit=100`,
        'https://comick.io/'
      );
      if (!json?.chapters?.length) break;

      for (const c of json.chapters) {
        if (isNovel(c.title)) continue;
        const num = cleanNum(c.chap);
        if (num !== null && c.hid) {
          chapters.push({ chNum: num, hid: c.hid, title: c.title || null });
        }
      }
      if (json.chapters.length < 100) break;
      page++;
      await delay(25);
    }

    if (chapters.length > 0) return { hid: comic.hid, slug: comic.slug, chapters };
  }
  return null;
}

// 6. MANGADEX
async function harvestMangaDex(searchTerms) {
  for (const term of searchTerms) {
    if (!term || isNovel(term)) continue;

    const json = await safeFetchJson(
      `https://api.mangadex.org/manga?title=${encodeURIComponent(term)}&limit=5&order[relevance]=desc`,
      'https://mangadex.org/'
    );
    if (!json?.data?.length) continue;

    const manga = json.data.find((m) => {
      const en = m.attributes?.title?.en || Object.values(m.attributes?.title || {})[0] || '';
      return isHighPrecisionMatch(term, en);
    });

    const mangaId = manga?.id;
    if (!mangaId) continue;

    const chapters = [];
    let offset = 0;
    while (offset <= 1500) {
      const feed = await safeFetchJson(
        `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&limit=100&offset=${offset}&order[chapter]=desc`,
        'https://mangadex.org/'
      );
      if (!feed?.data?.length) break;

      for (const item of feed.data) {
        const num = cleanNum(item.attributes?.chapter);
        if (num !== null && item.id) {
          chapters.push({ chNum: num, id: item.id, title: item.attributes?.title || null });
        }
      }
      if (feed.data.length < 100) break;
      offset += 100;
      await delay(30);
    }

    if (chapters.length > 0) return { mangaId, chapters };
  }
  return null;
}

// 7. MANGAPILL
async function harvestMangaPill(searchTerms) {
  for (const term of searchTerms) {
    if (!term || isNovel(term) || !/^[\x00-\x7F]+$/.test(term)) continue;

    const clean = term.replace(/['’]/g, '').trim();
    const html = await safeFetchHtml(`https://mangapill.com/search?q=${encodeURIComponent(clean)}`, 'https://mangapill.com/');
    if (!html) continue;

    const match = html.match(/href="\/manga\/([0-9]+\/([^"]+))"/i);
    if (!match) continue;

    const slug = match[1];
    const rawTitle = match[2].replace(/-/g, ' ');
    if (!isHighPrecisionMatch(clean, rawTitle)) continue;

    const pageHtml = await safeFetchHtml(`https://mangapill.com/manga/${slug}`, 'https://mangapill.com/');
    if (!pageHtml) continue;

    const chapters = [];
    const regex = /href="\/chapters\/([^"]+)"[^>]*>.*?chapter\s*([0-9]+(?:\.[0-9]+)?)/gi;
    let m;
    while ((m = regex.exec(pageHtml)) !== null) {
      const num = cleanNum(m[2]);
      if (num !== null) chapters.push({ chNum: num, chapterSlug: m[1] });
    }

    if (chapters.length > 0) return { slug, chapters };
  }
  return null;
}

// ============================================================================
// LAYER 4: STATISTICAL CONSENSUS & ANOMALY FILTER
// ============================================================================
function applyConsensusFilter(results, maxOfficialChapters) {
  if (!results.length) return [];

  // Extract the maximum chapter reported by each platform
  const maxes = results.map((r) => Math.max(...r.chapters.map((c) => c.chNum)));

  // If AniList provides an official max chapter, reject any source exceeding it by > 10%
  if (maxOfficialChapters && maxOfficialChapters > 0) {
    const hardLimit = maxOfficialChapters * 1.15;
    return results.filter((r) => {
      const sourceMax = Math.max(...r.chapters.map((c) => c.chNum));
      return sourceMax <= hardLimit;
    });
  }

  // Median-based Outlier Filter: reject sources reporting 2x higher than the median
  const sorted = [...maxes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  return results.filter((r) => {
    const sourceMax = Math.max(...r.chapters.map((c) => c.chNum));
    // If median is 100+, any report above 1.8x the median is discarded as an anomaly
    if (median > 80 && sourceMax > median * 1.8) {
      console.warn(`  ⚠️ Discarding statistical anomaly: Platform reported ${sourceMax} (Median: ${median})`);
      return false;
    }
    return true;
  });
}

// ============================================================================
// MAIN RECON ENGINE
// ============================================================================
async function runScout() {
  console.log('=== MangaFlow High-Precision Multi-Main Scout ===');

  const { data: gappedSeries } = await supabase
    .from('v_series_with_gaps')
    .select('series_id, title, slug, english_title, synonyms, missing_count')
    .order('missing_count', { ascending: false })
    .limit(30);

  const { data: scheduledSeries } = await supabase
    .from('series')
    .select('id, title, slug, english_title, synonyms')
    .order('updated_at', { ascending: true })
    .limit(50);

  const targetMap = new Map();
  for (const s of gappedSeries || []) {
    targetMap.set(s.series_id, { ...s, isGap: true });
  }
  for (const s of scheduledSeries || []) {
    if (!targetMap.has(s.id)) {
      targetMap.set(s.id, { ...s, isGap: false });
    }
  }

  const targets = Array.from(targetMap.values());
  console.log(`🎯 Scouting ${targets.length} priority series with Ground-Truth & Consensus validation.`);

  for (const s of targets) {
    console.log(`\n🔍 Verifying: "${s.title}" ${s.isGap ? `[GAP: -${s.missing_count}]` : '[CYCLE]'}`);

    await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id || s.series_id);

    // Anchor: AniList
    const anilist = await fetchAniListMetadata(s.title);
    if (anilist?.format === 'NOVEL') {
      console.log(`  ⛔ Skipped "${s.title}": AniList ground truth confirms light novel format.`);
      continue;
    }

    const aliases = [
      s.title,
      s.english_title,
      anilist?.englishTitle,
      anilist?.romajiTitle,
      s.slug?.replace(/-/g, ' '),
      ...(anilist?.synonyms || []),
      ...(s.synonyms || []),
    ];

    const uniqueAliases = [...new Set(aliases.filter(Boolean))];
    const seriesId = s.id || s.series_id;
    const harvested = [];

    // Parallel harvest across all 7 sources
    const [hive, asura, flame, nato, ck, md, mp] = await Promise.all([
      harvestHiveToons(uniqueAliases, s.slug),
      harvestAsura(uniqueAliases, s.slug),
      harvestFlameComics(uniqueAliases, s.slug),
      harvestMangaNato(uniqueAliases),
      harvestComicK(uniqueAliases),
      harvestMangaDex(uniqueAliases),
      harvestMangaPill(uniqueAliases),
    ]);

    if (hive?.chapters?.length) harvested.push({ platform: 'hivetoons', url: hive.url, id: hive.url, chapters: hive.chapters });
    if (asura?.chapters?.length) harvested.push({ platform: 'asura', url: asura.url, id: asura.url, chapters: asura.chapters });
    if (flame?.chapters?.length) harvested.push({ platform: 'flame', url: flame.url, id: flame.url, chapters: flame.chapters });
    if (nato?.chapters?.length) harvested.push({ platform: 'mangabat', url: nato.url, id: nato.url, chapters: nato.chapters });
    if (ck?.chapters?.length) harvested.push({ platform: 'comick', url: `https://comick.io/comic/${ck.slug}`, id: ck.hid, chapters: ck.chapters });
    if (md?.chapters?.length) harvested.push({ platform: 'mangadex', url: `https://mangadex.org/title/${md.mangaId}`, id: md.mangaId, chapters: md.chapters });
    if (mp?.chapters?.length) harvested.push({ platform: 'mangapill', url: `https://mangapill.com/manga/${mp.slug}`, id: mp.slug, chapters: mp.chapters });

    // Run Consensus Filter to drop outliers
    const verifiedSources = applyConsensusFilter(harvested, anilist?.maxOfficialChapters);

    for (const res of verifiedSources) {
      const maxCh = Math.max(...res.chapters.map((c) => c.chNum));
      await supabase.from('series_intel').upsert(
        {
          series_id: seriesId,
          slug: s.slug,
          source_platform: res.platform,
          target_url: res.url,
          target_identifier: res.id,
          latest_known_chapter: maxCh,
          verified_chapters: res.chapters,
          last_scouted_at: new Date().toISOString(),
        },
        { onConflict: 'series_id,source_platform' }
      );
      console.log(`  -> [${res.platform}] Saved ${res.chapters.length} verified chapters (Max: ${maxCh}).`);
    }

    await delay(120);
  }

  console.log('\n✅ High-Precision Scout cycle completed.');
}

runScout().catch(console.error);
