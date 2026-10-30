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
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, Referer: 'https://weebcentral.com/' },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const pages: string[] = [];

    $('section img, .chapter-images img, img.manga-image').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && !pages.includes(src.trim())) pages.push(src.trim());
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
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const pages: string[] = [];

    $('picture img, img.lazy, .container-reader img').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src && !pages.includes(src.trim())) pages.push(src.trim());
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
      });
      if (!res.ok) continue;
      const json = await res.json();
      const images = (json.chapter?.images || []).map((img: { url: string }) => img.url).filter(Boolean);
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
    });
    if (!res.ok) return [];
    const json = await res.json();
    const baseUrl = json.baseUrl;
    const hash = json.chapter?.hash;
    return (json.chapter?.data || []).map((f: string) => `${baseUrl}/data/${hash}/${f}`);
  } catch {
    return [];
  }
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
    const isValidPages = pages.length > 0 && pages.every((p) => typeof p === 'string' && p.startsWith('http'));

    if (!isValidPages || (pages.length === 1 && !pages[0].match(/\.(jpg|jpeg|png|webp|avif)/i))) {
      const source = chapter.source;
      const extId = chapter.external_id;

      if (source === 'weebcentral' && extId) {
        pages = await fetchWeebCentralPages(extId);
      } else if (source === 'mangapill' && extId) {
        pages = await fetchMangaPillPages(extId);
      } else if (source === 'comick' && extId) {
        const hid = extId.startsWith('comick:') ? extId.replace('comick:', '') : extId;
        pages = await fetchComickPages(hid);
      } else if (source === 'mangadex' && extId) {
        const dexId = extId.startsWith('mangadex:') ? extId.replace('mangadex:', '') : extId;
        pages = await fetchMangaDexPages(dexId);
      }

      if (pages.length > 0) {
        await supabaseAdmin
          .from('chapters')
          .update({ pages, updated_at: new Date().toISOString() })
          .eq('id', chapterId);
      }
    }

    const [prevRes, nextRes] = await Promise.all([
      supabaseAdmin
        .from('chapters')
        .select('id, chapter_number')
        .eq('series_id', chapter.series_id)
        .lt('chapter_number', chapter.chapter_number)
        .order('chapter_number', { ascending: false })
        .limit(1)
        .single(),
      supabaseAdmin
        .from('chapters')
        .select('id, chapter_number')
        .eq('series_id', chapter.series_id)
        .gt('chapter_number', chapter.chapter_number)
        .order('chapter_number', { ascending: true })
        .limit(1)
        .single(),
    ]);

    return NextResponse.json({
      chapter: {
        id: chapter.id,
        series_id: chapter.series_id,
        chapter_number: chapter.chapter_number,
        title: chapter.title,
        source: chapter.source,
        pages,
        series: chapter.series,
        prev_chapter: prevRes.data ? prevRes.data.id : null,
        next_chapter: nextRes.data ? nextRes.data.id : null,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}
