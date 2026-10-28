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

async function fetchMangaDexPages(chapterDexId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.mangadex.org/at-home/server/${chapterDexId}`, {
      headers: BROWSER_HEADERS,
      next: { revalidate: 3600 },
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

async function fetchMangaPillPages(targetUrl: string): Promise<string[]> {
  try {
    const res = await fetch(targetUrl, {
      headers: BROWSER_HEADERS,
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const pages: string[] = [];

    $('picture img, img.lazy, .container-reader img').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src && !pages.includes(src.trim())) {
        pages.push(src.trim());
      }
    });

    return pages;
  } catch {
    return [];
  }
}

async function fetchManhwatopPages(chapterUrl: string): Promise<string[]> {
  try {
    const res = await fetch(chapterUrl, {
      headers: {
        ...BROWSER_HEADERS,
        'Referer': 'https://manhwatop.com/',
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const pages: string[] = [];

    $('.reading-content img, .page-break img').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src && !pages.includes(src.trim())) {
        pages.push(src.trim());
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

    // Detect if pages array only stores an external link or placeholder
    const isPlaceholder =
      finalPages.length <= 1 &&
      finalPages[0] &&
      (finalPages[0] === chapter.external_id ||
        finalPages[0].includes('mangapill.com') ||
        finalPages[0].includes('manhwatop.com') ||
        !finalPages[0].match(/\.(jpg|jpeg|png|webp|avif)(\?.*)?$/i));

    if (isPlaceholder) {
      const source = chapter.source || '';
      const identifier = chapter.external_id || finalPages[0];

      if (source === 'manhwatop') {
        finalPages = await fetchManhwatopPages(identifier);
      } else if (source === 'mangadex' || identifier.length === 36) {
        finalPages = await fetchMangaDexPages(identifier);
      } else {
        finalPages = await fetchMangaPillPages(identifier);
      }

      // Persist resolved pages in Supabase so subsequent reads load instantly
      if (finalPages.length > 0) {
        await supabase
          .from('chapters')
          .update({ pages: finalPages })
          .eq('id', chapterId);
      }
    }

    const baseUrl = chapter.base_url ? chapter.base_url.replace(/\/$/, '') : '';
    const resolvedPages = finalPages
      .map((page: string) => {
        if (!page) return '';
        if (page.startsWith('http://') || page.startsWith('https://')) {
          return page;
        }
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
