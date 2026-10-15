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

const PRIORITY_SERIES = [
  {
    title: 'Lookism',
    hiveSlug: 'lookism',
    asuraSlug: null,
  },
  {
    title: "Omniscient Reader's Viewpoint",
    hiveSlug: null,
    asuraSlug: 'omniscient-readers-viewpoint',
  },
  {
    title: 'The Beginning After the End',
    hiveSlug: null,
    asuraSlug: 'the-beginning-after-the-end',
  },
  {
    title: 'Lord of the Mysteries',
    hiveSlug: null,
    asuraSlug: null,
  },
  {
    title: 'Shadow Slave',
    hiveSlug: null,
    asuraSlug: null,
  },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

// 1. Hive Toon Scraper (.org domain)
async function fetchHiveToon(slug) {
  try {
    const res = await fetch(`https://hivetoons.org/series/${slug}`, { headers: HEADERS });
    if (!res.ok) return [];
    const html = await res.text();

    const regex = /href=["'][^"']*\/chapter-(\d+(\.\d+)?)["']/gi;
    const chapters = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      const num = parseFloat(match[1]);
      if (!isNaN(num)) {
        chapters.push({
          chapter_number: num,
          title: `Chapter ${num}`,
          published_at: new Date().toISOString(),
        });
      }
    }
    return chapters;
  } catch {
    return [];
  }
}

// 2. Asura Scans Scraper (Active domain)
async function fetchAsura(slug) {
  try {
    const res = await fetch(`https://asurascans.com/series/${slug}`, { headers: HEADERS });
    if (!res.ok) return [];
    const html = await res.text();

    const regex = /href=["'][^"']*\/chapter\/(\d+(\.\d+)?)["']/gi;
    const chapters = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      const num = parseFloat(match[1]);
      if (!isNaN(num)) {
        chapters.push({
          chapter_number: num,
          title: `Chapter ${num}`,
          published_at: new Date().toISOString(),
        });
      }
    }
    return chapters;
  } catch {
    return [];
  }
}

// 3. MangaNato Direct HTML Mirror (Fallback for missing/cultivation titles)
async function fetchMangaNato(query) {
  try {
    const searchUrl = `https://manganato.com/search/story/${encodeURIComponent(query.toLowerCase().replace(/[^a-z0-9]/g, '_'))}`;
    const searchRes = await fetch(searchUrl, { headers: HEADERS });
    if (!searchRes.ok) return [];
    const html = await searchRes.text();

    const linkMatch = html.match(/class=["']item-title["'][^>]*href=["'](https:\/\/[^"']+)["']/i);
    if (!linkMatch) return [];

    const storyUrl = linkMatch[1];
    await delay(400);

    const storyRes = await fetch(storyUrl, { headers: HEADERS });
    if (!storyRes.ok) return [];
    const storyHtml = await storyRes.text();

    const chapRegex = /href=["'][^"']*chapter-(\d+(\.\d+)?)["']/gi;
    const chapters = [];
    let m;
    while ((m = chapRegex.exec(storyHtml)) !== null) {
      const num = parseFloat(m[1]);
      if (!isNaN(num)) {
        chapters.push({
          chapter_number: num,
          title: `Chapter ${num}`,
          published_at: new Date().toISOString(),
        });
      }
    }
    return chapters;
  } catch {
    return [];
  }
}

async function run() {
  console.log('=== Checking Scans for Latest Releases ===\n');

  for (const item of PRIORITY_SERIES) {
    console.log(`Checking "${item.title}"...`);

    const { data: s } = await supabase
      .from('series')
      .select('id')
      .ilike('title', `%${item.title}%`)
      .limit(1)
      .maybeSingle();

    if (!s?.id) {
      console.warn(`  ✗ Series not found in database: "${item.title}"`);
      continue;
    }

    let foundChapters = [];

    // 1. Hive Toon check
    if (item.hiveSlug) {
      console.log(`  -> Polling Hive Toons (${item.hiveSlug})...`);
      foundChapters = await fetchHiveToon(item.hiveSlug);
    }

    // 2. Asura check
    if (foundChapters.length === 0 && item.asuraSlug) {
      console.log(`  -> Polling Asura Scans (${item.asuraSlug})...`);
      foundChapters = await fetchAsura(item.asuraSlug);
    }

    // 3. Fallback mirror
    if (foundChapters.length === 0) {
      console.log(`  -> Polling aggregate mirror...`);
      foundChapters = await fetchMangaNato(item.title);
    }

    if (foundChapters.length === 0) {
      console.warn(`  ✗ No new chapters detected.`);
      continue;
    }

    const rows = foundChapters.map((c) => ({
      series_id: s.id,
      chapter_number: c.chapter_number,
      title: c.title,
      published_at: c.published_at,
    }));

    // Deduplicate
    const unique = Array.from(new Map(rows.map((r) => [r.chapter_number, r])).values());

    // Upsert into Supabase
    for (let i = 0; i < unique.length; i += 200) {
      const slice = unique.slice(i, i + 200);
      await supabase
        .from('chapters')
        .upsert(slice, { onConflict: 'series_id,chapter_number', ignoreDuplicates: true });
    }

    const highest = Math.max(...unique.map((r) => r.chapter_number));
    console.log(`  ✓ Synced ${unique.length} chapters. Current latest: Ch. ${highest}\n`);
    await delay(500);
  }

  console.log('=== Poll Finished Successfully ===');
}

run().catch((err) => {
  console.error('Fatal crash:', err);
  process.exit(1);
});
