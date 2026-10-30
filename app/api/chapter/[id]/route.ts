// app/api/chapter/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchWeebCentralPages(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, { headers: { ...BROWSER_HEADERS, Referer: 'https://weebcentral.com/' }, cache: 'no-store' });
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
    const res = await fetch(url, { headers: { ...BROWSER_HEADERS, Referer: 'https://mangapill.com/' }, cache: 'no-store' });
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
  try {
    const res = await fetch(`https://api.comick.fun/chapter/${hid}`, { headers: BROWSER_HEADERS, cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.chapter?.images || []).map((img: { url: string }) => img.url).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchMangaDexPages(chapterDexId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.mangadex.org/at-home/server/${chapterDexId}`, { headers: BROWSER_HEADERS, cache: 'no-store' });
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

    const { data: chapter, error } = await supabase
      .from('chapters')
      .select('id, series_id, chapter_number, title, source, external_id, base_url, pages, series:series_id(id, title, slug, cover_url, reading_mode)')
      .eq('id', chapterId)
      .single();

    if (error || !chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

    let finalPages: string[] = chapter.pages || [];
    const needsResolution =
      finalPages.length <= 1 &&
      (!finalPages[0] ||
        finalPages[0] === chapter.external_id ||
        finalPages[0].includes('mangapill.com/chapters') ||
        finalPages[0].includes('weebcentral.com') ||
        !finalPages[0].match(/\.(jpg|jpeg|png|webp|avif)(\?.*)?$/i));

    if (needsResolution) {
      const targetUrl = chapter.external_id || finalPages[0] || '';
      const source = chapter.source || '';

      if (targetUrl.includes('weebcentral.com')) {
        finalPages = await fetchWeebCentralPages(targetUrl);
      } else if (targetUrl.includes('mangapill.com')) {
        finalPages = await fetchMangaPillPages(targetUrl);
      } else if (source === 'comick' || targetUrl.includes('comick.')) {
        const hid = targetUrl.split('/').filter(Boolean).pop() || '';
        finalPages = await fetchComickPages(hid);
      } else if (source === 'mangadex' || /^[a-f0-9-]{36}$/.test(targetUrl)) {
        finalPages = await fetchMangaDexPages(targetUrl);
      }

      if (finalPages.length > 0) {
        await supabase.from('chapters').update({ pages: finalPages }).eq('id', chapterId);
      }
    }

    const [prevRes, nextRes, allChapsRes] = await Promise.all([
      supabase.from('chapters').select('id, chapter_number').eq('series_id', chapter.series_id).lt('chapter_number', chapter.chapter_number).order('chapter_number', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('chapters').select('id, chapter_number').eq('series_id', chapter.series_id).gt('chapter_number', chapter.chapter_number).order('chapter_number', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('chapters').select('id, chapter_number').eq('series_id', chapter.series_id).order('chapter_number', { ascending: true }),
    ]);

    return NextResponse.json({
      ...chapter,
      pages: finalPages,
      prevChapter: prevRes.data || null,
      nextChapter: nextRes.data || null,
      allChapters: allChapsRes.data || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
