// app/api/chapter/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchWeebCentralPages(url: string): Promise<string[]> {
  try {
    const chapterId = url.match(/chapters\/([A-Z0-9]+)/i)?.[1];
    const imageEndpoint = chapterId
      ? `https://weebcentral.com/chapters/${chapterId}/images?is_prev=False&current_page=1&reading_style=long_strip`
      : url;

    const res = await fetch(imageEndpoint, {
      headers: { ...BROWSER_HEADERS, 'HX-Request': 'true', Referer: url },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const pages: string[] = [];

    $('img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && src.startsWith('http') && !src.includes('logo') && !pages.includes(src.trim())) {
        pages.push(src.trim());
      }
    });
    return pages;
  } catch {
    return [];
  }
}

async function fetchMangaPillPages(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, Referer: 'https://mangapill.com/' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const pages: string[] = [];

    $('picture img, img.js-page, .container-reader img').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src && src.startsWith('http') && !pages.includes(src.trim())) {
        pages.push(src.trim());
      }
    });
    return pages;
  } catch {
    return [];
  }
}

async function fetchComickPages(hid: string): Promise<string[]> {
  const domains = ['https://api.comick.dev', 'https://api.comick.io', 'https://comick.io'];

  for (const base of domains) {
    try {
      const res = await fetch(`${base}/chapter/${hid}`, {
        headers: { ...BROWSER_HEADERS, Referer: 'https://comick.io/' },
        cache: 'no-store',
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const images = (json.chapter?.images || [])
        .map((img: { url?: string; b2key?: string }) =>
          img.url ? img.url : img.b2key ? `https://meo.comick.pictures/${img.b2key}` : null
        )
        .filter(Boolean) as string[];
      if (images.length > 0) return images;
    } catch {}
  }
  return [];
}

async function fetchMangaDexPages(chapterDexId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.mangadex.org/at-home/server/${chapterDexId}`, {
      headers: BROWSER_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const baseUrl = json.baseUrl;
    const hash = json.chapter?.hash;
    const files = json.chapter?.data || json.chapter?.dataSaver || [];
    const mode = json.chapter?.data ? 'data' : 'data-saver';
    return files.map((f: string) => `${baseUrl}/${mode}/${hash}/${f}`);
  } catch {
    return [];
  }
}

// Emergency JSON API Failover: Searches Comick & MangaDex by title + chapter_number if primary HTML scraper fails
async function emergencyFallbackResolve(seriesTitle: string, chapterNum: number): Promise<{ pages: string[]; source: string } | null> {
  const clean = seriesTitle.toLowerCase().replace(/[^\w\s-]/g, '').trim();

  // 1. Try Comick JSON API
  try {
    const sRes = await fetch(`https://api.comick.dev/v1.0/search?q=${encodeURIComponent(clean)}&limit=1`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(6000),
    });
    if (sRes.ok) {
      const sJson = await sRes.json();
      const hid = sJson?.[0]?.hid;
      if (hid) {
        const cRes = await fetch(`https://api.comick.dev/comic/${hid}/chapters?lang=en&chap=${chapterNum}&limit=5`, {
          headers: BROWSER_HEADERS,
          signal: AbortSignal.timeout(6000),
        });
        if (cRes.ok) {
          const cJson = await cRes.json();
          const match = (cJson.chapters || []).find((c: any) => parseFloat(c.chap) === Number(chapterNum));
          if (match?.hid) {
            const pages = await fetchComickPages(match.hid);
            if (pages.length > 0) return { pages, source: 'comick' };
          }
        }
      }
    }
  } catch {}

  // 2. Try MangaDex JSON API
  try {
    const mRes = await fetch(`https://api.mangadex.org/manga?title=${encodeURIComponent(clean)}&limit=1`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(6000),
    });
    if (mRes.ok) {
      const mJson = await mRes.json();
      const mangaId = mJson?.data?.[0]?.id;
      if (mangaId) {
        const fRes = await fetch(
          `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=en&chapter=${chapterNum}&limit=5`,
          { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(6000) }
        );
        if (fRes.ok) {
          const fJson = await fRes.json();
          const chId = fJson?.data?.[0]?.id;
          if (chId) {
            const pages = await fetchMangaDexPages(chId);
            if (pages.length > 0) return { pages, source: 'mangadex' };
          }
        }
      }
    }
  } catch {}

  return null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const chapterId = params.id;
    if (!chapterId) return NextResponse.json({ error: 'Missing chapter ID' }, { status: 400 });

    const { data: chapter, error } = await supabaseAdmin
      .from('chapters')
      .select(
        'id, series_id, chapter_number, title, source, external_id, base_url, pages, series:series_id(id, title, slug, cover_url, reading_mode)'
      )
      .eq('id', chapterId)
      .single();

    if (error || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    let pages: string[] = Array.isArray(chapter.pages) ? chapter.pages : [];
    let resolvedSource = chapter.source;

    const hasResolvedImages =
      pages.length > 1 ||
      (pages.length === 1 && /\.(jpg|jpeg|png|webp|avif)(\?.*)?$/i.test(pages[0]));

    if (!hasResolvedImages) {
      const extId = chapter.external_id || pages[0] || '';

      if (resolvedSource === 'weebcentral' || extId.includes('weebcentral.com')) {
        pages = await fetchWeebCentralPages(extId);
      } else if (resolvedSource === 'mangapill' || extId.includes('mangapill.com')) {
        pages = await fetchMangaPillPages(extId);
      } else if (resolvedSource === 'comick' || extId.startsWith('comick:')) {
        const hid = extId.replace('comick:', '').split('/').pop() || '';
        pages = await fetchComickPages(hid);
      } else if (resolvedSource === 'mangadex' || extId.startsWith('mangadex:') || extId.includes('mangadex.org')) {
        const dexId = extId.replace('mangadex:', '').split('/').pop() || '';
        pages = await fetchMangaDexPages(dexId);
      }

      // If primary scraper failed due to upstream DOM change or Cloudflare block, auto-failover to JSON APIs
      const seriesObj = Array.isArray(chapter.series) ? chapter.series[0] : chapter.series;
      if (pages.length === 0 && seriesObj?.title) {
        const fallback = await emergencyFallbackResolve(seriesObj.title, Number(chapter.chapter_number));
        if (fallback) {
          pages = fallback.pages;
          resolvedSource = fallback.source;
        }
      }

      if (pages.length > 0) {
        await supabaseAdmin
          .from('chapters')
          .update({ pages, source: resolvedSource, updated_at: new Date().toISOString() })
          .eq('id', chapterId);
      }
    }

    const [prevRes, nextRes, allChapsRes] = await Promise.all([
      supabaseAdmin
        .from('chapters')
        .select('id, chapter_number')
        .eq('series_id', chapter.series_id)
        .lt('chapter_number', chapter.chapter_number)
        .order('chapter_number', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('chapters')
        .select('id, chapter_number')
        .eq('series_id', chapter.series_id)
        .gt('chapter_number', chapter.chapter_number)
        .order('chapter_number', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('chapters')
        .select('id, chapter_number')
        .eq('series_id', chapter.series_id)
        .order('chapter_number', { ascending: false }),
    ]);

    return NextResponse.json(
      {
        id: chapter.id,
        series_id: chapter.series_id,
        chapter_number: chapter.chapter_number,
        title: chapter.title,
        source: resolvedSource,
        base_url: chapter.base_url,
        pages,
        series: chapter.series,
        prevChapter: prevRes.data || null,
        nextChapter: nextRes.data || null,
        allChapters: allChapsRes.data || [],
      },
      {
        headers: {
          'Cache-Control': pages.length > 0
            ? 'public, s-maxage=3600, stale-while-revalidate=86400'
            : 'no-store',
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}
