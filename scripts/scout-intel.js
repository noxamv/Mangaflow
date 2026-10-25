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

// Full browser emulation headers to prevent datacenter Cloudflare blocks
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

// Strict Title Similarity Guard: Rejects unrelated fuzzy matches
function isTitleMatch(queryTitle, candidateTitle) {
  if (!queryTitle || !candidateTitle) return false;
  const cleanQ = queryTitle.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  const cleanC = candidateTitle.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();

  if (cleanQ.includes(cleanC) || cleanC.includes(cleanQ)) return true;

  const qWords = cleanQ.split(/\s+/).filter((w) => w.length > 2);
  const cWords = cleanC.split(/\s+/).filter((w) => w.length > 2);
  if (!qWords.length || !cWords.length) return false;

  const common = qWords.filter((w) => cWords.includes(w));
  return common.length / Math.min(qWords.length, cWords.length) >= 0.5;
}

// ============================================================================
// MAIN SOURCE HARVESTERS
// ============================================================================

// 1. HIVETOONS HARVESTER
async function harvestHiveToons(searchTerms, slug) {
  const candidateSlugs = [
    slug,
    slug?.replace(/-/g, ''),
    ...searchTerms.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '-')),
  ];
  const uniqueSlugs = [...new Set(candidateSlugs.filter(Boolean))];

  for (const s of uniqueSlugs) {
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

// 2. ASURA SCANS HARVESTER
async function harvestAsura(searchTerms, slug) {
  const candidateSlugs = [slug, ...searchTerms.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '-'))];
  const uniqueSlugs = [...new Set(candidateSlugs.filter(Boolean))];

  for (const s of uniqueSlugs) {
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

// 3. FLAME COMICS HARVESTER
async function harvestFlameComics(searchTerms, slug) {
  const candidateSlugs = [slug, ...searchTerms.map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, '-'))];
  const uniqueSlugs = [...new Set(candidateSlugs.filter(Boolean))];

  for (const s of uniqueSlugs) {
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
  const mirrorHosts = [
    'https://natomanga.com',
    'https://chapmanganato.to',
    'https://manganato.com',
  ];

  for (const term of searchTerms) {
    if (!term || isNovel(term)) continue;
    const clean = term.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');

    for (const host of mirrorHosts) {
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
      if (candidateTitle && !isTitleMatch(term, candidateTitle)) continue;

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

// 5. COMICK HARVESTER
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
      (c) => c.comic_type !== 'novel' && !isNovel(c.title) && !c.slug?.includes('novel') && isTitleMatch(clean, c.title)
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

// 6. MANGADEX HARVESTER
async function harvestMangaDex(searchTerms) {
  for (const term of searchTerms) {
    if (!term || isNovel(term)) continue;

    const json = await safeFetchJson(
      `https://api.mangadex.org/manga?title=${encodeURIComponent(term)}&limit=5&order[relevance]=desc`,
      'https://mangadex.org/'
    );
    if (!json?.data?.length) continue;

    const manga = json.data.find((m) => {
      const en = (m.attributes?.title?.en || Object.values(m.attributes?.title || {})[0] || '').toLowerCase();
      return !en.includes('(novel)') && !en.includes('[novel]') && isTitleMatch(term, en);
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

// 7. MANGAPILL HARVESTER
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
    if (!isTitleMatch(clean, rawTitle)) continue;

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
// MAIN UNIFIED SCOUT RUNNER
// ============================================================================
async function runScout() {
  console.log('=== MangaFlow Multi-Main Ecosystem Scout Initialized ===');

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
    targetMap.set(s.series_id, {
      id: s.series_id,
      title: s.title,
      slug: s.slug,
      english_title: s.english_title,
      synonyms: s.synonyms,
      isGap: true,
      missingCount: s.missing_count,
    });
  }
  for (const s of scheduledSeries || []) {
    if (!targetMap.has(s.id)) {
      targetMap.set(s.id, {
        id: s.id,
        title: s.title,
        slug: s.slug,
        english_title: s.english_title,
        synonyms: s.synonyms,
        isGap: false,
      });
    }
  }

  const targets = Array.from(targetMap.values());
  console.log(`🎯 Scouting ${targets.length} priority series across 7 mainline sources.`);

  for (const s of targets) {
    console.log(`\n🔍 Target: ${s.title} ${s.isGap ? `[GAP: -${s.missingCount}]` : '[CYCLE]'}`);

    await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);

    const aliases = [s.title, s.english_title, s.slug?.replace(/-/g, ' ')];
    if (s.slug === 'star-martial-god-technique' || s.title?.includes('Astral Sutra')) {
      aliases.unshift('Star Martial God Technique');
    }
    if (s.slug?.includes('mercenary') || s.title?.toLowerCase().includes('mercenary enrollment')) {
      aliases.push('Teenage Mercenary');
    }
    if (Array.isArray(s.synonyms)) {
      aliases.push(...s.synonyms);
    }

    const uniqueAliases = [...new Set(aliases.filter(Boolean))];

    // Source 1: HiveToons
    try {
      const hive = await harvestHiveToons(uniqueAliases, s.slug);
      if (hive?.chapters?.length) {
        const maxCh = Math.max(...hive.chapters.map((c) => c.chNum));
        await supabase.from('series_intel').upsert(
          {
            series_id: s.id,
            slug: s.slug,
            source_platform: 'hivetoons',
            target_url: hive.url,
            target_identifier: hive.url,
            latest_known_chapter: maxCh,
            verified_chapters: hive.chapters,
            last_scouted_at: new Date().toISOString(),
          },
          { onConflict: 'series_id,source_platform' }
        );
        console.log(`  -> [HiveToons] Harvested ${hive.chapters.length} chapters.`);
      }
    } catch {}

    // Source 2: AsuraScans
    try {
      const asura = await harvestAsura(uniqueAliases, s.slug);
      if (asura?.chapters?.length) {
        const maxCh = Math.max(...asura.chapters.map((c) => c.chNum));
        await supabase.from('series_intel').upsert(
          {
            series_id: s.id,
            slug: s.slug,
            source_platform: 'asura',
            target_url: asura.url,
            target_identifier: asura.url,
            latest_known_chapter: maxCh,
            verified_chapters: asura.chapters,
            last_scouted_at: new Date().toISOString(),
          },
          { onConflict: 'series_id,source_platform' }
        );
        console.log(`  -> [Asura] Harvested ${asura.chapters.length} chapters.`);
      }
    } catch {}

    // Source 3: FlameComics
    try {
      const flame = await harvestFlameComics(uniqueAliases, s.slug);
      if (flame?.chapters?.length) {
        const maxCh = Math.max(...flame.chapters.map((c) => c.chNum));
        await supabase.from('series_intel').upsert(
          {
            series_id: s.id,
            slug: s.slug,
            source_platform: 'flame',
            target_url: flame.url,
            target_identifier: flame.url,
            latest_known_chapter: maxCh,
            verified_chapters: flame.chapters,
            last_scouted_at: new Date().toISOString(),
          },
          { onConflict: 'series_id,source_platform' }
        );
        console.log(`  -> [FlameComics] Harvested ${flame.chapters.length} chapters.`);
      }
    } catch {}

    // Source 4: MangaNato & Mirrors
    try {
      const nato = await harvestMangaNato(uniqueAliases);
      if (nato?.chapters?.length) {
        const maxCh = Math.max(...nato.chapters.map((c) => c.chNum));
        await supabase.from('series_intel').upsert(
          {
            series_id: s.id,
            slug: s.slug,
            source_platform: 'mangabat',
            target_url: nato.url,
            target_identifier: nato.url,
            latest_known_chapter: maxCh,
            verified_chapters: nato.chapters,
            last_scouted_at: new Date().toISOString(),
          },
          { onConflict: 'series_id,source_platform' }
        );
        console.log(`  -> [MangaNato/Mirrors] Harvested ${nato.chapters.length} chapters.`);
      }
    } catch {}

    // Source 5: ComicK
    try {
      const ck = await harvestComicK(uniqueAliases);
      if (ck?.chapters?.length) {
        const maxCh = Math.max(...ck.chapters.map((c) => c.chNum));
        await supabase.from('series_intel').upsert(
          {
            series_id: s.id,
            slug: s.slug,
            source_platform: 'comick',
            target_url: `https://comick.io/comic/${ck.slug}`,
            target_identifier: ck.hid,
            latest_known_chapter: maxCh,
            verified_chapters: ck.chapters,
            last_scouted_at: new Date().toISOString(),
          },
          { onConflict: 'series_id,source_platform' }
        );
        console.log(`  -> [ComicK] Harvested ${ck.chapters.length} chapters.`);
      }
    } catch {}

    // Source 6: MangaDex
    try {
      const md = await harvestMangaDex(uniqueAliases);
      if (md?.chapters?.length) {
        const maxCh = Math.max(...md.chapters.map((c) => c.chNum));
        await supabase.from('series_intel').upsert(
          {
            series_id: s.id,
            slug: s.slug,
            source_platform: 'mangadex',
            target_url: `https://mangadex.org/title/${md.mangaId}`,
            target_identifier: md.mangaId,
            latest_known_chapter: maxCh,
            verified_chapters: md.chapters,
            last_scouted_at: new Date().toISOString(),
          },
          { onConflict: 'series_id,source_platform' }
        );
        console.log(`  -> [MangaDex] Harvested ${md.chapters.length} chapters.`);
      }
    } catch {}

    // Source 7: MangaPill
    try {
      const mp = await harvestMangaPill(uniqueAliases);
      if (mp?.chapters?.length) {
        const maxCh = Math.max(...mp.chapters.map((c) => c.chNum));
        await supabase.from('series_intel').upsert(
          {
            series_id: s.id,
            slug: s.slug,
            source_platform: 'mangapill',
            target_url: `https://mangapill.com/manga/${mp.slug}`,
            target_identifier: mp.slug,
            latest_known_chapter: maxCh,
            verified_chapters: mp.chapters,
            last_scouted_at: new Date().toISOString(),
          },
          { onConflict: 'series_id,source_platform' }
        );
        console.log(`  -> [MangaPill] Harvested ${mp.chapters.length} chapters.`);
      }
    } catch {}

    await delay(100);
  }

  console.log('\n✅ Multi-main scout cycle completed across all 7 mainline platforms.');
}

runScout().catch(console.error);
