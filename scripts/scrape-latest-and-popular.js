import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Fatal Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: null },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Priority targets and their direct scanlation sources
const PRIORITY_SERIES = [
  {
    title: 'Lookism',
    sources: [
      { name: 'Hive Scans', type: 'hive', slug: 'lookism' },
      { name: 'Consumet', type: 'consumet', query: 'Lookism' },
    ],
  },
  {
    title: "Omniscient Reader's Viewpoint",
    sources: [
      { name: 'Asura Scans', type: 'asura', slug: 'omniscient-readers-viewpoint' },
      { name: 'Consumet', type: 'consumet', query: 'Omniscient Reader' },
    ],
  },
  {
    title: 'The Beginning After the End',
    sources: [
      { name: 'Temple Scan', type: 'temple', slug: 'the-beginning-after-the-end' },
      { name: 'Consumet', type: 'consumet', query: 'The Beginning After the End' },
    ],
  },
  {
    title: 'Lord of the Mysteries',
    sources: [
      { name: 'Consumet', type: 'consumet', query: 'Lord of the Mysteries' },
    ],
  },
  {
    title: 'Shadow Slave',
    sources: [
      { name: 'Consumet', type: 'consumet', query: 'Shadow Slave' },
    ],
  },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal, headers: HEADERS });
    clearTimeout(id);
    return res;
  } catch {
    clearTimeout(id);
    return null;
  }
}

// 1. Hive Scans Direct Chapter Fetcher
async function fetchHiveChapters(slug) {
  try {
    // Hive Scans public chapter list API endpoint
    const url = `https://api.hivetoons.com/api/series/${slug}/chapters`;
    const res = await fetchWithTimeout(url);
    if (res && res.ok) {
      const data = await res.json();
      const list = data?.chapters || data?.data || (Array.isArray(data) ? data : []);
      if (list.length > 0) {
        return list.map((c) => ({
          num: parseFloat(c.chapter_number || c.number || c.index),
          title: c.title || `Chapter ${c.chapter_number || c.number}`,
          date: c.created_at || c.published_at || new Date().toISOString(),
        })).filter((c) => !isNaN(c.num));
      }
    }

    // HTML fallback if API structure changes
    const htmlRes = await fetchWithTimeout(`https://hivetoons.com/series/${slug}`);
    if (htmlRes && htmlRes.ok) {
      const html = await htmlRes.text();
      const regex = /href=["'][^"']*\/chapter-(\d+(\.\d+)?)["']/gi;
      const chaps = [];
      let m;
      while ((m = regex.exec(html)) !== null) {
        chaps.push({
          num: parseFloat(m[1]),
          title: `Chapter ${m[1]}`,
          date: new Date().toISOString(),
        });
      }
      return chaps;
    }
  } catch (err) {
    console.warn(`    ⚠️ Hive Scans error:`, err.message);
  }
  return [];
}

// 2. Asura Scans Direct Fetcher
async function fetchAsuraChapters(slug) {
  try {
    const url = `https://asuracomic.net/series/${slug}`;
    const res = await fetchWithTimeout(url);
    if (!res || !res.ok) return [];

    const html = await res.text();
    const regex = /href=["'][^"']*\/chapter\/(\d+(\.\d+)?)["']/gi;
    const chaps = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      chaps.push({
        num: parseFloat(match[1]),
        title: `Chapter ${match[1]}`,
        date: new Date().toISOString(),
      });
    }
    return chaps;
  } catch {
    return [];
  }
}

// 3. Temple Scan Direct Fetcher
async function fetchTempleChapters(slug) {
  try {
    const url = `https://templescan.net/comic/${slug}`;
    const res = await fetchWithTimeout(url);
    if (!res || !res.ok) return [];

    const html = await res.text();
    const regex = /href=["'][^"']*\/chapter-(\d+(\.\d+)?)["']/gi;
    const chaps = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      chaps.push({
        num: parseFloat(match[1]),
        title: `Chapter ${match[1]}`,
        date: new Date().toISOString(),
      });
    }
    return chaps;
  } catch {
    return [];
  }
}

// 4. Consumet Fallback Fetcher
async function fetchConsumetChapters(query) {
  try {
    const searchUrl = `https://api.consumet.org/manga/mangakakalot/${encodeURIComponent(query)}`;
    const searchRes = await fetchWithTimeout(searchUrl);
    if (!searchRes || !searchRes.ok) return [];

    const searchData = await searchRes.json();
    const mangaId = searchData?.results?.[0]?.id;
    if (!mangaId) return [];

    await delay(400);
    const infoUrl = `https://api.consumet.org/manga/mangakakalot/info?id=${encodeURIComponent(mangaId)}`;
    const infoRes = await fetchWithTimeout(infoUrl);
    if (!infoRes || !infoRes.ok) return [];

    const infoData = await infoRes.json();
    const list = infoData?.chapters || [];

    return list.map((ch) => {
      const match = (ch.title || ch.id || '').match(/chapter[^\d]*(\d+(\.\d+)?)/i);
      const num = match ? parseFloat(match[1]) : null;
      return {
        num,
        title: ch.title || `Chapter ${num}`,
        date: new Date().toISOString(),
      };
    }).filter((c) => c.num !== null && !isNaN(c.num));
  } catch {
    return [];
  }
}

async function run() {
  console.log('=== Scraper: Hive Scans / Asura / Temple / Aggregators ===\n');

  for (const item of PRIORITY_SERIES) {
    console.log(`Checking series: "${item.title}"`);

    const { data: s } = await supabase
      .from('series')
      .select('id, title')
      .ilike('title', `%${item.title}%`)
      .limit(1)
      .maybeSingle();

    if (!s?.id) {
      console.warn(`  ✗ Series not found in Supabase: "${item.title}"`);
      continue;
    }

    let rawChapters = [];

    // Try dedicated scan sites first, then fallbacks
    for (const src of item.sources) {
      console.log(`  -> Trying source: ${src.name}...`);
      if (src.type === 'hive') {
        rawChapters = await fetchHiveChapters(src.slug);
      } else if (src.type === 'asura') {
        rawChapters = await fetchAsuraChapters(src.slug);
      } else if (src.type === 'temple') {
        rawChapters = await fetchTempleChapters(src.slug);
      } else if (src.type === 'consumet') {
        rawChapters = await fetchConsumetChapters(src.query);
      }

      if (rawChapters.length > 0) {
        console.log(`  ✓ Received ${rawChapters.length} chapter markers from ${src.name}`);
        break;
      }
      await delay(400);
    }

    if (rawChapters.length === 0) {
      console.warn(`  ✗ No chapters returned across any configured sources.`);
      continue;
    }

    // Format & deduplicate chapters
    const unique = Array.from(
      new Map(
        rawChapters.map((c) => [
          c.num,
          {
            series_id: s.id,
            chapter_number: c.num,
            title: c.title,
            published_at: c.date,
          },
        ])
      ).values()
    );

    // Batch upsert to database in chunks of 200
    for (let i = 0; i < unique.length; i += 200) {
      const chunk = unique.slice(i, i + 200);
      await supabase
        .from('chapters')
        .upsert(chunk, { onConflict: 'series_id,chapter_number', ignoreDuplicates: true });
    }

    const latest = Math.max(...unique.map((c) => c.chapter_number));
    console.log(`  ✓ Sync complete for "${item.title}". Highest chapter: ${latest}\n`);
    await delay(500);
  }

  console.log('=== All Scanlation Sites Polled Successfully ===');
}

run().catch((err) => {
  console.error('Fatal crash:', err);
  process.exit(1);
});
