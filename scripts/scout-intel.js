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
    const timeout = setTimeout(() => controller.abort(), 10000);
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
    const timeout = setTimeout(() => controller.abort(), 10000);
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

// 1. ANILIST GROUND-TRUTH ANCHOR
async function fetchAniListMetadata(title) {
  const query = `
    query ($search: String) {
      Media (search: $search, type: MANGA) {
        id
        title { romaji english native }
        format
        status
        chapters
        synonyms
      }
    }
  `;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
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
    if (!media || media.format === 'NOVEL') return null;

    return {
      format: media.format,
      status: media.status,
      maxOfficialChapters: media.chapters || null,
      englishTitle: media.title?.english || null,
      romajiTitle: media.title?.romaji || null,
      synonyms: Array.isArray(media.synonyms) ? media.synonyms : [],
    };
  } catch {
    return null;
  }
}

// 2. HIGH-PRECISION LEVENSHTEIN & TOKEN SIMILARITY
function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function isHighPrecisionMatch(queryTitle, candidateTitle) {
  if (!queryTitle || !candidateTitle || isNovel(candidateTitle)) return false;

  const q = queryTitle.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const c = candidateTitle.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (q === c) return true;

  const qTokens = q.split(' ').filter((w) => w.length > 1);
  const cTokens = c.split(' ').filter((w) => w.length > 1);
  if (!qTokens.length || !cTokens.length) return false;

  const matchedTokens = qTokens.filter((token) => cTokens.includes(token));
  const tokenRecall = matchedTokens.length / qTokens.length;

  const extraTokens = cTokens.filter((token) => !qTokens.includes(token));
  const disqualifiers = ['double', 'reboot', 'side', 'after', 'anthology', 'novel'];
  if (extraTokens.some((t) => disqualifiers.includes(t))) return false;

  const maxLen = Math.max(q.length, c.length);
  const dist = levenshteinDistance(q, c);
  const stringSim = 1 - dist / maxLen;

  return tokenRecall >= 0.85 || stringSim >= 0.85;
}

// 3. SOURCE HARVESTERS WITH ACTIVE DOMAIN MIRROR RINGS
async function harvestHiveToons(searchTerms, slug) {
  const mirrors = ['https://hivetoons.org', 'https://hivetoons.com'];
  const candidateSlugs = [slug, slug?.replace(/-/g, ''), ...searchTerms.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '-'))];
  const uniqueSlugs = [...new Set(candidateSlugs.filter(Boolean))];

  for (const host of mirrors) {
    for (const s of uniqueSlugs) {
      const url = `${host}/series/${s}`;
      const html = await safeFetchHtml(url, `${host}/`);
      if (!html || html.includes('404 Not Found') || !html.includes('chapter-')) continue;

      const chapters = [];
      const regex = /href=["'](https?:\/\/[^"']*\/series\/[^"']*\/chapter-([0-9]+(?:\.[0-9]+)?)[^"']*)["']/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const num = cleanNum(match[2]);
        if (num !== null) chapters.push({ chNum: num, url: match[1], title: `Chapter ${num}` });
      }
      if (chapters.length > 0) return { url, chapters };
    }
  }
  return null;
}

async function harvestAsura(searchTerms, slug) {
  const mirrors = ['https://asurascans.com', 'https://asuracomic.net'];
  const candidateSlugs = [slug, ...searchTerms.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '-'))];
  const uniqueSlugs = [...new Set(candidateSlugs.filter(Boolean))];

  for (const host of mirrors) {
    for (const s of uniqueSlugs) {
      const url = `${host}/series/${s}`;
      const html = await safeFetchHtml(url, `${host}/`);
      if (!html || !html.includes('chapter/')) continue;

      const chapters = [];
      const regex = /href=["'](https?:\/\/[^"']*\/series\/[^"']*\/chapter\/([0-9]+(?:\.[0-9]+)?)[^"']*)["']/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const num = cleanNum(match[2]);
        if (num !== null) chapters.push({ chNum: num, url: match[1], title: `Chapter ${num}` });
      }
      if (chapters.length > 0) return { url, chapters };
    }
  }
  return null;
}

async function harvestFlameComics(searchTerms, slug) {
  const mirrors = ['https://flamecomics.me', 'https://flamecomics.xyz'];
  const candidateSlugs = [slug, ...searchTerms.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '-'))];
  const uniqueSlugs = [...new Set(candidateSlugs.filter(Boolean))];

  for (const host of mirrors) {
    for (const s of uniqueSlugs) {
      const url = `${host}/series/${s}`;
      const html = await safeFetchHtml(url, `${host}/`);
      if (!html || !html.includes('chapter/')) continue;

      const chapters = [];
      const regex = /href=["'](https?:\/\/[^"']*\/series\/[^"']*\/chapter\/([0-9]+(?:\.[0-9]+)?)[^"']*)["']/gi;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const num = cleanNum(match[2]);
        if (num !== null) chapters.push({ chNum: num, url: match[1], title: `Chapter ${num}` });
      }
      if (chapters.length > 0) return { url, chapters };
    }
  }
  return null;
}

async function harvestMangaNato(searchTerms) {
  const mirrors = ['https://natomanga.com', 'https://chapmanganato.to', 'https://manganato.com', 'https://readmangabat.com'];
  for (const term of searchTerms) {
    if (!term || isNovel(term)) continue;
    const clean = term.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');

    for (const host of mirrors) {
      const searchUrl = `${host}/search/story/${encodeURIComponent(clean.toLowerCase())}`;
      const html = await safeFetchHtml(searchUrl, host);
      if (!html) continue;

      const linkRegex = /href="(https:\/\/[^"]*(?:manganato|mangabat|natomanga)\.com\/[^"]*(?:manga|story)-[^"]+)"[^>]*title="([^"]+)"/gi;
      let match = linkRegex.exec(html);
      if (!match) {
        const generic = html.match(/href="(https:\/\/[^"]*(?:manganato|mangabat|natomanga)\.com\/[^"]*(?:manga|story)-[^"]+)"/i);
        if (generic) match = [null, generic[1], term];
      }
      if (!match) continue;

      const mangaUrl = match[1];
      const candidateTitle = match[2] || '';
      if (candidateTitle && !isHighPrecisionMatch(term, candidateTitle)) continue;

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
      await delay(20);
    }
    if (chapters.length > 0) return { hid: comic.hid, slug: comic.slug, chapters };
  }
  return null;
}

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
      await delay(25);
    }
    if (chapters.length > 0) return { mangaId, chapters };
  }
  return null;
}

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

function applyConsensusFilter(results, maxOfficialChapters) {
  if (!results.length) return [];
  const maxes = results.map((r) => Math.max(...r.chapters.map((c) => c.chNum)));

  if (maxOfficialChapters && maxOfficialChapters > 0) {
    const hardLimit = maxOfficialChapters * 1.15;
    return results.filter((r) => {
      const sMax = Math.max(...r.chapters.map((c) => c.chNum));
      return sMax <= hardLimit;
    });
  }

  const sorted = [...maxes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  return results.filter((r) => {
    const sMax = Math.max(...r.chapters.map((c) => c.chNum));
    if (median > 80 && sMax > median * 1.8) {
      console.warn(`  ⚠️ Dropping anomaly: Platform reported ${sMax} (Median: ${median})`);
      return false;
    }
    return true;
  });
}

// 4. CONCURRENT ENGINE WORKER POOL
async function scoutSingleSeries(s) {
  console.log(`\n🔍 Verifying: "${s.title}" ${s.isGap ? `[GAP: -${s.missing_count}]` : '[CYCLE]'}`);

  await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id || s.series_id);

  const anilist = await fetchAniListMetadata(s.title);
  if (anilist?.format === 'NOVEL') {
    console.log(`  ⛔ Skipped "${s.title}": AniList ground truth confirms light novel format.`);
    return;
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

  const verified = applyConsensusFilter(harvested, anilist?.maxOfficialChapters);

  for (const res of verified) {
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
}

async function runScout() {
  console.log('=== MangaFlow Concurrent High-Precision Recon Engine ===');

  // Pull all gapped series first, followed by rotation
  const { data: gappedSeries } = await supabase
    .from('v_series_with_gaps')
    .select('series_id, title, slug, english_title, synonyms, missing_count')
    .order('missing_count', { ascending: false })
    .limit(80);

  const { data: scheduledSeries } = await supabase
    .from('series')
    .select('id, title, slug, english_title, synonyms')
    .order('updated_at', { ascending: true })
    .limit(100);

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
  console.log(`🎯 Scouting ${targets.length} priority series with 4-worker pool concurrency.`);

  let index = 0;
  const pool = new Array(4).fill(null).map(async () => {
    while (index < targets.length) {
      const cur = targets[index++];
      try {
        await scoutSingleSeries(cur);
      } catch (err) {
        console.warn(`Scout error on "${cur.title}":`, err.message);
      }
    }
  });

  await Promise.all(pool);
  console.log('\n✅ High-Precision Concurrent Scout pass completed across catalog.');
}

runScout().catch(console.error);
