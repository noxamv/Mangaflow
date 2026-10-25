// scripts/scout-intel.js
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let aiClient = null;
if (GEMINI_API_KEY) {
  aiClient = new GoogleGenerativeAI(GEMINI_API_KEY);
}

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
    if (!res.ok) return null;
    return await res.json();
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
    if (!res.ok) return null;
    return await res.text();
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

// 1. ANILIST METADATA ANCHOR
async function fetchAniListMetadata(title) {
  const query = `
    query ($search: String) {
      Media (search: $search, type: MANGA) {
        id
        idMal
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
      id: media.id,
      mal_id: media.idMal || null,
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

// 2. GEMINI GROUND-TRUTH VALIDATOR
async function verifyComicChapterWithAI(title, candidateMaxChapter) {
  if (!aiClient || !candidateMaxChapter || candidateMaxChapter <= 25) {
    return { isValidComic: true, maxComicChapter: candidateMaxChapter };
  }

  try {
    const prompt = `You are a strict manga/manhwa/comic database validator.
Series Title: "${title}"
Scraped Chapter Ceiling: ${candidateMaxChapter}

Task:
Determine if the illustrated comic/manhwa adaptation has reached Chapter ${candidateMaxChapter} in unofficial English scanlations or Korean/Japanese raws.
Flag web novel or light novel contamination (where the text novel has 200-1000 chapters, but the comic adaptation only has 50-140 chapters).

Respond strictly with valid JSON without markdown fences:
{
  "isValidComic": boolean,
  "maxComicChapter": number,
  "reason": "brief explanation"
}`;

    const model = aiClient.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text);
  } catch (err) {
    console.warn(`  ⚠️ AI Ground-Truth fallback for "${title}":`, err.message);
    return { isValidComic: true, maxComicChapter: candidateMaxChapter };
  }
}

// 3. TITLE SIMILARITY
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
  const disqualifiers = ['double', 'reboot', 'side', 'after', 'anthology', 'novel', 'special', 'remake', 'oneshot', 'spinoff'];
  if (extraTokens.some((t) => disqualifiers.includes(t))) return false;

  if (qTokens.length === 1 && cTokens.length > 1) {
    if (q !== c) return false;
  }

  const maxLen = Math.max(q.length, c.length);
  const dist = levenshteinDistance(q, c);
  const stringSim = 1 - dist / maxLen;

  return tokenRecall >= 0.88 || stringSim >= 0.88;
}

// 4. MULTI-MIRROR SOURCE HARVESTERS

// 1. HIVETOONS
async function harvestHiveToons(searchTerms, slug) {
  const mirrors = ['https://hivetoons.org', 'https://hivetoons.com'];
  const candidateSlugs = [
    slug,
    slug?.replace(/-/g, ''),
    slug ? `${slug}-comic` : null,
    slug ? `${slug}-manhwa` : null,
    ...searchTerms.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '-')),
  ];
  const uniqueSlugs = [...new Set(candidateSlugs.filter(Boolean))];

  for (const host of mirrors) {
    for (const s of uniqueSlugs) {
      const paths = [`/series/${s}`, `/${s}`];
      for (const p of paths) {
        const url = `${host}${p}`;
        const html = await safeFetchHtml(url, `${host}/`);
        if (!html || html.includes('404 Not Found') || !html.includes('chapter-')) continue;

        const chapters = [];
        const regex = /href=["'](https?:\/\/[^"']*\/chapter-([0-9]+(?:\.[0-9]+)?)[^"']*)["']/gi;
        let match;
        while ((match = regex.exec(html)) !== null) {
          const num = cleanNum(match[2]);
          if (num !== null) chapters.push({ chNum: num, url: match[1], title: `Chapter ${num}` });
        }
        if (chapters.length > 0) return { url, chapters };
      }
    }
  }
  return null;
}

// 2. ARENASCANS
async function harvestArenaScans(searchTerms, slug) {
  const mirrors = ['https://arenascan.com', 'https://arenascans.net'];
  const candidateSlugs = [slug, slug?.replace(/-/g, ''), ...searchTerms.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '-'))];
  const uniqueSlugs = [...new Set(candidateSlugs.filter(Boolean))];

  for (const host of mirrors) {
    for (const s of uniqueSlugs) {
      const paths = [`/series/${s}`, `/manga/${s}`];
      for (const p of paths) {
        const url = `${host}${p}`;
        const html = await safeFetchHtml(url, `${host}/`);
        if (!html || html.includes('404 Not Found') || !html.includes('chapter')) continue;

        const chapters = [];
        const regex = /href=["'](https?:\/\/[^"']*\/chapter[/-]([0-9]+(?:\.[0-9]+)?)[^"']*)["']/gi;
        let match;
        while ((match = regex.exec(html)) !== null) {
          const num = cleanNum(match[2]);
          if (num !== null) chapters.push({ chNum: num, url: match[1], title: `Chapter ${num}` });
        }
        if (chapters.length > 0) return { url, chapters };
      }
    }
  }
  return null;
}

// 3. MANGABUDDY
async function harvestMangaBuddy(searchTerms, slug) {
  const host = 'https://mangabuddy.com';
  const candidateSlugs = [
    slug,
    slug?.replace(/-/g, ''),
    slug ? `${slug}-comic` : null,
    ...searchTerms.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '-')),
  ];
  const uniqueSlugs = [...new Set(candidateSlugs.filter(Boolean))];

  for (const s of uniqueSlugs) {
    const url = `${host}/${s}`;
    const html = await safeFetchHtml(url, `${host}/`);
    if (!html || html.includes('404 Not Found') || !html.includes('chapter-')) continue;

    const chapters = [];
    const regex = /href=["'](\/[^"']*\/chapter-([0-9]+(?:\.[0-9]+)?)[^"']*)["']/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const num = cleanNum(match[2]);
      if (num !== null) {
        const fullUrl = match[1].startsWith('http') ? match[1] : `${host}${match[1]}`;
        chapters.push({ chNum: num, url: fullUrl, title: `Chapter ${num}` });
      }
    }
    if (chapters.length > 0) return { url, chapters };
  }
  return null;
}

// 4. ASURA SCANS
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

// 5. FLAME COMICS
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

// 6. MANGANATO / MANGABAT
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

// 7. COMICK (Multi-Gateway Redundancy)
async function harvestComicK(searchTerms) {
  const apiGateways = ['https://api.comick.io', 'https://api.comick.cc', 'https://api.comick.app'];

  for (const term of searchTerms) {
    if (!term || isNovel(term)) continue;
    const clean = term.replace(/['’]/g, '').trim();

    for (const gateway of apiGateways) {
      const search = await safeFetchJson(
        `${gateway}/v1.0/search?q=${encodeURIComponent(clean)}&limit=10&type=comic`,
        'https://comick.io/'
      );
      if (!Array.isArray(search) || !search.length) continue;

      const comic = search.find(
        (c) => c.comic_type !== 'novel' && !isNovel(c.title) && isHighPrecisionMatch(clean, c.title)
      );
      if (!comic?.hid) continue;

      const chapters = [];
      let page = 1;
      while (page <= 40) {
        const json = await safeFetchJson(
          `${gateway}/comic/${comic.hid}/chapters?lang=en&page=${page}&limit=100`,
          'https://comick.io/'
        );
        if (!json?.chapters?.length) break;

        for (const c of json.chapters) {
          if (isNovel(c.title)) continue;
          const num = cleanNum(c.chap);
          const imageCount = c.images_count || (Array.isArray(c.images) ? c.images.length : 10);
          if (num !== null && c.hid && imageCount >= 5) {
            chapters.push({ chNum: num, hid: c.hid, title: c.title || null });
          }
        }
        if (json.chapters.length < 100) break;
        page++;
        await delay(20);
      }
      if (chapters.length > 0) return { hid: comic.hid, slug: comic.slug, chapters };
    }
  }
  return null;
}

// 8. MANGADEX
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
        const pageCount = item.attributes?.pages || 0;
        if (num !== null && item.id && pageCount >= 5) {
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

// 9. MANGAPILL
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

// 5. WORKER POOL
async function scoutSingleSeries(s) {
  console.log(`\n🔍 Verifying: "${s.title}" ${s.isGap ? `[GAP: -${s.missing_count}]` : '[CYCLE]'}`);

  await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id || s.series_id);

  const anilist = await fetchAniListMetadata(s.title);
  if (anilist?.format === 'NOVEL') {
    console.log(`  ⛔ Skipped "${s.title}": AniList ground truth confirms light novel format.`);
    return;
  }

  if (anilist?.id) {
    await supabase
      .from('series')
      .update({
        anilist_id: anilist.id,
        mal_id: anilist.mal_id || null,
      })
      .eq('id', s.id || s.series_id);
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

  const [hive, arena, buddy, asura, flame, nato, ck, md, mp] = await Promise.all([
    harvestHiveToons(uniqueAliases, s.slug),
    harvestArenaScans(uniqueAliases, s.slug),
    harvestMangaBuddy(uniqueAliases, s.slug),
    harvestAsura(uniqueAliases, s.slug),
    harvestFlameComics(uniqueAliases, s.slug),
    harvestMangaNato(uniqueAliases),
    harvestComicK(uniqueAliases),
    harvestMangaDex(uniqueAliases),
    harvestMangaPill(uniqueAliases),
  ]);

  if (hive?.chapters?.length) harvested.push({ platform: 'hivetoons', url: hive.url, id: hive.url, chapters: hive.chapters });
  if (arena?.chapters?.length) harvested.push({ platform: 'arenascans', url: arena.url, id: arena.url, chapters: arena.chapters });
  if (buddy?.chapters?.length) harvested.push({ platform: 'mangabuddy', url: buddy.url, id: buddy.url, chapters: buddy.chapters });
  if (asura?.chapters?.length) harvested.push({ platform: 'asura', url: asura.url, id: asura.url, chapters: asura.chapters });
  if (flame?.chapters?.length) harvested.push({ platform: 'flame', url: flame.url, id: flame.url, chapters: flame.chapters });
  if (nato?.chapters?.length) harvested.push({ platform: 'mangabat', url: nato.url, id: nato.url, chapters: nato.chapters });
  if (ck?.chapters?.length) harvested.push({ platform: 'comick', url: `https://comick.io/comic/${ck.slug}`, id: ck.hid, chapters: ck.chapters });
  if (md?.chapters?.length) harvested.push({ platform: 'mangadex', url: `https://mangadex.org/title/${md.mangaId}`, id: md.mangaId, chapters: md.chapters });
  if (mp?.chapters?.length) harvested.push({ platform: 'mangapill', url: `https://mangapill.com/manga/${mp.slug}`, id: mp.slug, chapters: mp.chapters });

  if (!harvested.length) return;

  const candidateMax = Math.max(...harvested.flatMap((r) => r.chapters.map((c) => c.chNum)), 0);
  const aiAudit = await verifyComicChapterWithAI(s.title, candidateMax);

  let trueComicCeiling = candidateMax;
  if (!aiAudit.isValidComic) {
    trueComicCeiling = aiAudit.maxComicChapter || candidateMax;
    console.log(`  🤖 AI Ground-Truth Guard: "${s.title}" trimmed from ${candidateMax} down to true comic max ${trueComicCeiling} (${aiAudit.reason})`);
  }

  for (const res of harvested) {
    const validChapters = res.chapters.filter((c) => c.chNum <= trueComicCeiling);
    if (!validChapters.length) continue;

    const maxCh = Math.max(...validChapters.map((c) => c.chNum));

    await supabase.from('series_intel').upsert(
      {
        series_id: seriesId,
        slug: s.slug,
        source_platform: res.platform,
        target_url: res.url,
        target_identifier: res.id,
        latest_known_chapter: maxCh,
        verified_chapters: validChapters,
        last_scouted_at: new Date().toISOString(),
      },
      { onConflict: 'series_id,source_platform' }
    );
    console.log(`  -> [${res.platform}] Saved ${validChapters.length} verified chapters (Max: ${maxCh}).`);
  }
}

async function runScout() {
  console.log('=== MangaFlow 9-Source Recon Engine with AI Validation ===');

  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  const { data: gappedSeries } = await supabase
    .from('v_series_with_gaps')
    .select('series_id, title, slug, english_title, synonyms, missing_count')
    .order('missing_count', { ascending: false })
    .limit(30);

  const { data: scheduledSeries } = await supabase
    .from('series')
    .select('id, title, slug, english_title, synonyms')
    .lt('updated_at', sixHoursAgo)
    .order('updated_at', { ascending: true })
    .limit(30);

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
  console.log(`🎯 Scouting ${targets.length} priority series with AI-grounded validation.`);

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
  console.log('\n✅ AI-Grounded Recon pass completed.');
}

runScout().catch(console.error);
