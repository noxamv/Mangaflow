// app/api/chapter/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// 1. COMICK MULTI-SCAN HUB (Asura, Reaper, Flame, HiveToon, Void mirrored in one API)
async function fetchComickPages(hid: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.comick.fun/chapter/${hid}`, {
      headers: BROWSER_HEADERS,
      cache: 'no-store'
    });
    if (!res.ok) return [];
    const data = await res.json();
    const images = data.chapter?.images || [];
    return images.map((img: { url: string }) => img.url).filter(Boolean);
  } catch {
    return [];
  }
}

// 2. MANGADEX OFFICIAL API
async function fetchMangaDexPages(chapterDexId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.mangadex.org/at-home/server/${chapterDexId}`, {
      headers: BROWSER_HEADERS,
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const json = await res.json();
    const baseUrl = json.baseUrl;
    const hash = json.chapter?.hash;
    const files = json.chapter?.data || [];
    return files.map((file: string) => `${baseUrl}/data/${hash}/${file}`);
  } catch {
    return [];
  }
}

// 3. UNIVERSAL WEBTOON / SCANLATOR PARSER (HiveToon, Asura, Arena, Toonily, MangaStream/Madara)
async function fetchUniversalScanPages(targetUrl: string): Promise<string[]> {
  try {
    const urlObj = new URL(targetUrl);
    const res = await fetch(targetUrl, {
      headers: {
        ...BROWSER_HEADERS,
        'Referer': `${urlObj.protocol}//${urlObj.host}/`
      },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const pages: string[] = [];

    // Common selectors used across 95% of manga/manhwa reader themes
    const selectors = [
      '.reading-content img',
      '#readerarea img',
      '.page-break img',
      'picture img',
      'img.manga-image',
      '.container-reader img',
      'div#chapter-images img'
    ];

    $(selectors.join(', ')).each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('src');
      if (src) {
        const cleanSrc = src.trim();
        // Ignore decorative ads, tracking pixels, or tiny logos
        if (!cleanSrc.includes('logo') && !cleanSrc.includes('banner') && !pages.includes(cleanSrc)) {
          pages.push(cleanSrc.startsWith('//') ? `https:${cleanSrc}` : cleanSrc);
        }
      }
    });

    return pages;
  } catch {
    return [];
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const chapterId = params.id;
    if (!chapterId) {
      return NextResponse.json({ error: 'Chapter ID is required' }, { status: 400 });
    }

    const { data: chapter, error } = await supabase
      .from('chapters')
      .select(`
        id,
        series_id,
        chapter_number,
        title,
        source,
        external_id,
        base_url,
        pages,
        created_at,
        updated_at,
        series:series_id (
          id,
          title,
          slug,
          cover_url,
          reading_mode
        )
      `)
      .eq('id', chapterId)
      .single();

    if (error || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    let finalPages: string[] = chapter.pages || [];

    // Check if the stored pages array needs live on-demand parsing
    const isNeedsResolution =
      finalPages.length <= 1 &&
      (!finalPages[0] ||
        finalPages[0] === chapter.external_id ||
        finalPages[0].startsWith('http') && !finalPages[0].match(/\.(jpg|jpeg|png|webp|avif)(\?.*)?$/i));

    if (isNeedsResolution || finalPages.length === 0) {
      const targetUrl = chapter.external_id || finalPages[0] || '';
      const source = chapter.source || '';

      // Route to appropriate multi-source resolver
      if (source === 'comick' || targetUrl.includes('comick.')) {
        const hid = targetUrl.split('/').filter(Boolean).pop() || '';
        finalPages = await fetchComickPages(hid);
      } else if (source === 'mangadex' || /^[a-f0-9-]{36}$/.test(targetUrl)) {
        finalPages = await fetchMangaDexPages(targetUrl);
      } else if (targetUrl.startsWith('http')) {
        finalPages = await fetchUniversalScanPages(targetUrl);
      }

      // Automatically cache in database so the next reader gets instant loading
      if (finalPages.length > 0) {
        await supabase
          .from('chapters')
          .update({ pages: finalPages })
          .eq('id', chapterId);
      }
    }

    // Resolve MangaDex relative paths if applicable
    const defaultBaseUrl = 'https://uploads.mangadex.org';
    const baseUrl = chapter.base_url
      ? chapter.base_url.replace(/\/$/, '')
      : defaultBaseUrl;

    const resolvedPages = finalPages
      .map((page: string) => {
        if (!page) return '';
        if (page.startsWith('http://') || page.startsWith('https://')) return page;
        if (page.startsWith('data/')) return `${baseUrl}/${page}`;
        return baseUrl ? `${baseUrl}/${page.replace(/^\//, '')}` : page;
      })
      .filter(Boolean);

    // Fetch pagination controls
    const [prevRes, nextRes, allChapsRes] = await Promise.all([
      supabase
        .from('chapters')
        .select('id, chapter_number')
        .eq('series_id', chapter.series_id)
        .lt('chapter_number', chapter.chapter_number)
        .order('chapter_number', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('chapters')
        .select('id, chapter_number')
        .eq('series_id', chapter.series_id)
        .gt('chapter_number', chapter.chapter_number)
        .order('chapter_number', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('chapters')
        .select('id, chapter_number')
        .eq('series_id', chapter.series_id)
        .order('chapter_number', { ascending: true }),
    ]);

    return NextResponse.json({
      ...chapter,
      pages: resolvedPages,
      prevChapter: prevRes.data || null,
      nextChapter: nextRes.data || null,
      allChapters: allChapsRes.data || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
