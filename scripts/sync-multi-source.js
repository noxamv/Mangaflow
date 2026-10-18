import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_ID = parseInt(process.env.WORKER_ID || '1', 10);
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '5', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
};

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

function cleanNum(val) {
  if (val == null) return null;
  const match = String(val).match(/[0-9]+(\.[0-9]+)?/);
  return match ? parseFloat(match[0]) : null;
}

function stripAccents(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function resolveSource(title, slug) {
  const normTitle = stripAccents(title);
  const normSlug = (slug || '').toLowerCase();

  // Flagship / Backlog Mappings
  if (normTitle.includes('wu lian dian feng') || normTitle.includes('martial peak')) return { source: 'comick', hid: 'martial-peak' };
  if (normTitle.includes('lookism') || normSlug.includes('lookism')) return { source: 'comick', hid: '00-lookism' };
  if (normTitle.includes('meitantei conan') || normTitle.includes('detective conan')) return { source: 'comick', hid: 'detective-conan' };
  if (normTitle.includes('fangkai nage') || normTitle.includes('release that witch')) return { source: 'comick', hid: 'release-that-witch' };
  if (normTitle.includes('tieji gangbing') || normTitle.includes('iron ladies')) return { source: 'comick', hid: 'iron-ladies' };
  if (normTitle.includes('doupo cangqiong') || normTitle.includes('battle through the heavens')) return { source: 'comick', hid: 'battle-through-the-heavens' };
  if (normTitle.includes('wan zha chao huang') || normTitle.includes('cheating men must die')) return { source: 'comick', hid: 'cheating-men-must-die' };
  if (normTitle.includes('omniscient') || normTitle.includes('dokja')) return { source: 'comick', hid: 'omniscient-readers-viewpoint' };
  if (normTitle.includes('yao shen ji') || normTitle.includes('tales of demons and gods')) return { source: 'comick', hid: 'tales-of-demons-and-gods' };
  if (normTitle.includes('swordmaster')) return { source: 'comick', hid: 'swordmasters-youngest-son' };
  if (normTitle.includes('the servant is the demon king')) return { source: 'comick', hid: 'the-servant-is-the-demon-king' };
  if (normTitle.includes('jitsu wa ore')) return { source: 'comick', hid: 'jitsu-wa-ore-saikyou-deshita' };
  if (normTitle.includes('arifureta')) return { source: 'comick', hid: 'arifureta-shokugyou-de-sekai-saikyou' };
  if (normTitle.includes('the beginning after the end') || normTitle.includes('tbate')) return { source: 'comick', hid: 'the-beginning-after-the-end' };
  if (normTitle.includes('login murim') || normTitle.includes('log in murim')) return { source: 'comick', hid: 'log-in-murim' };

  // ComicK Search
  const ck = await fetchJson(`https://api.comick.io/v1.0/search?q=${encodeURIComponent(normTitle)}&limit=1`);
  if (ck?.[0]?.hid) return { source: 'comick', hid: ck[0].hid };

  // MangaDex Fallback
  const md = await fetchJson(`https://api.mangadex.org/manga?title=${encodeURIComponent(normTitle)}&limit=1`);
  if (md?.data?.[0]?.id) return { source: 'mangadex', id: md.data[0].id };

  return null;
}

async function getComicKMap(hid) {
  const map = new Map();
  let page = 1;

  // Deep pagination up to 40 pages (4,000 chapters) for Martial Peak and long series
  while (page <= 40) {
    const data = await fetchJson(`https://api.comick.io/comic/${hid}/chapters?lang=en&page=${page}&limit=100`);
    if (!data?.chapters?.length) break;

    for (const ch of data.chapters) {
      const num = cleanNum(ch.chap);
      if (num !== null) {
        if (!map.has(num)) map.set(num, []);
        map.get(num).push(ch.hid);
      }
    }
    if (data.chapters.length < 100) break;
    page++;
    await delay(120);
  }
  return map;
}

async function getComicKPages(hids) {
  for (const hid of hids) {
    const data = await fetchJson(`https://api.comick.io/chapter/${hid}`);
    if (data?.chapter?.images?.length) {
      return data.chapter.images.map((img) => {
        if (img.url.startsWith('http')) return img.url;
        return `https://meo3.comick.pictures/${img.url}`;
      });
    }
    await delay(100);
  }
  return null;
}

async function getMangaDexMap(mangaId) {
  const map = new Map();
  let offset = 0;

  while (offset < 1000) {
    const url = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage%5B%5D=en&order%5Bchapter%5D=asc&limit=100&offset=${offset}`;
    const data = await fetchJson(url);
    if (!data?.data?.length) break;

    for (const ch of data.data) {
      const num = cleanNum(ch.attributes?.chapter);
      if (num !== null && !map.has(num)) {
        map.set(num, ch.id);
      }
    }
    if (data.data.length < 100) break;
    offset += 100;
    await delay(120);
  }
  return map;
}

async function getMangaDexPages(chapterId) {
  const atHome = await fetchJson(`https://api.mangadex.org/at-home/server/${chapterId}`);
  if (!atHome?.baseUrl || !atHome?.chapter?.data?.length) return null;
  const { baseUrl, chapter } = atHome;
  return chapter.data.map((f) => `${baseUrl}/data/${chapter.hash}/${f}`);
}

async function runWorker() {
  console.log(`Worker ${WORKER_ID} of ${TOTAL_WORKERS} running.`);

  // Expanded query batch to 150 series to maximize throughput
  const { data: allSeries } = await supabase
    .from('series')
    .select('id, title, slug, updated_at')
    .order('updated_at', { ascending: true, nullsFirst: true })
    .limit(150);

  if (!allSeries?.length) return;

  const assigned = allSeries.filter((_, idx) => idx % TOTAL_WORKERS === WORKER_ID - 1);
  console.log(`Worker ${WORKER_ID} assigned ${assigned.length} series.`);

  for (const s of assigned) {
    const { data: emptyChapters } = await supabase
      .from('chapters')
      .select('id, chapter_number')
      .eq('series_id', s.id)
      .or('pages.is.null,pages.eq.{}')
      .order('chapter_number', { ascending: true })
      .limit(100);

    if (!emptyChapters?.length) {
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    console.log(`\n[Worker ${WORKER_ID}] Auditing "${s.title}" (${emptyChapters.length} empty chapters)...`);

    const source = await resolveSource(s.title, s.slug);
    if (!source) {
      console.log(`[Worker ${WORKER_ID}] No source located for "${s.title}". Touching updated_at.`);
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    let map = new Map();
    if (source.source === 'comick') map = await getComicKMap(source.hid);
    else if (source.source === 'mangadex') map = await getMangaDexMap(source.id);

    console.log(`[Worker ${WORKER_ID}] Mapped ${map.size} chapters online via ${source.source}.`);

    if (map.size === 0) {
      await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
      continue;
    }

    let filledCount = 0;
    const CHUNK_SIZE = 3;

    for (let i = 0; i < emptyChapters.length; i += CHUNK_SIZE) {
      const chunk = emptyChapters.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (ch) => {
          const targetNum = cleanNum(ch.chapter_number);
          if (targetNum === null || !map.has(targetNum)) return;

          let pages = null;
          if (source.source === 'comick') {
            pages = await getComicKPages(map.get(targetNum));
          } else if (source.source === 'mangadex') {
            pages = await getMangaDexPages(map.get(targetNum));
          }

          if (pages && pages.length > 0) {
            const { error: upErr } = await supabase
              .from('chapters')
              .update({ pages })
              .eq('id', ch.id);

            if (!upErr) {
              filledCount++;
              console.log(`✓ [Worker ${WORKER_ID}] "${s.title}" Ch. ${ch.chapter_number} -> ${pages.length} panels`);
            } else {
              console.error(`[Worker ${WORKER_ID}] DB Error on Ch. ${ch.chapter_number}:`, upErr.message);
            }
          }
        })
      );

      await delay(250);
    }

    console.log(`[Worker ${WORKER_ID}] Result for "${s.title}": filled ${filledCount}/${emptyChapters.length}`);
    await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', s.id);
  }

  console.log(`Worker ${WORKER_ID} complete.`);
}

runWorker().catch((err) => {
  console.error('Fatal worker crash:', err);
  process.exit(1);
});
