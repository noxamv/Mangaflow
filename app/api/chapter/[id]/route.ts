// app/api/chapter/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
  auth: { persistSession: false },
});

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
};

// 1. MangaDex Page Manifest
async function resolveMangaDexPages(chapterId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.mangadex.org/at-home/server/${chapterId}`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const { baseUrl, chapter } = data;
    const hash = chapter?.hash;
    const fileNames = chapter?.data || [];

    return fileNames.map(
      (file: string) => `/api/proxy-image?url=${encodeURIComponent(`${baseUrl}/data/${hash}/${file}`)}`
    );
  } catch {
    return [];
  }
}

// 2. Comick Page Manifest
async function resolveComickPages(hid: string): Promise<string[]> {
  const domains = ['https://api.comick.dev', 'https://api.comick.io'];
  for (const domain of domains) {
    try {
      const res = await fetch(`${domain}/chapter/${hid}`, {
        headers: { ...BROWSER_HEADERS, Referer: 'https://comick.io/' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const images = data.chapter?.images || [];
      if (images.length > 0) {
        return images.map(
          (img: any) =>
            `/api/proxy-image?url=${encodeURIComponent(
              img.url?.startsWith('http') ? img.url : `https://meo.comick.pictures/${img.bkey}`
            )}`
        );
      }
    } catch {}
  }
  return [];
}

// 3. General HTML Scraper (MangaPill, WeebCentral, Manganato)
async function resolveExternalHtmlPages(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, Referer: new URL(url).origin },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const imgMatches = Array.from(html.matchAll(/<img[^>]+(?:data-)?src=["']([^"']+)["']/gi));
    const pages: string[] = [];

    for (const match of imgMatches) {
      const src = match[1];
      if (
        src &&
        (src.includes('chapter') || src.includes('manga') || src.includes('page') || src.includes('cdn')) &&
        !src.includes('avatar') &&
        !src.includes('logo') &&
        !src.includes('banner')
      ) {
        const fullUrl = src.startsWith('http') ? src : new URL(src, url).href;
        pages.push(`/api/proxy-image?url=${encodeURIComponent(fullUrl)}`);
      }
    }
    return pages;
  } catch {
    return [];
  }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: 'Chapter ID required' }, { status: 400 });
  }

  // 1. Fetch DB record
  const { data: chapter, error } = await supabase
    .from('chapters')
    .select('id, series_id, chapter_number, title, pages, external_id, source')
    .eq('id', id)
    .single();

  if (error || !chapter) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }

  // 2. Return instantly if pages already exist
  if (Array.isArray(chapter.pages) && chapter.pages.length > 0 && chapter.pages[0].startsWith('http')) {
    return NextResponse.json({
      id: chapter.id,
      series_id: chapter.series_id,
      chapter_number: chapter.chapter_number,
      title: chapter.title,
      pages: chapter.pages.map((p: string) =>
        p.startsWith('/api/proxy-image') ? p : `/api/proxy-image?url=${encodeURIComponent(p)}`
      ),
      cached: true,
    });
  }

  // 3. Multi-Platform On-Demand Resolution
  let resolvedPages: string[] = [];

  // Branch A: MangaDex
  if (chapter.source === 'mangadex' || chapter.external_id?.startsWith('mangadex:')) {
    const cleanId = (chapter.external_id || '').replace(/^mangadex:/i, '');
    resolvedPages = await resolveMangaDexPages(cleanId);
  }

  // Branch B: Comick
  if (resolvedPages.length === 0 && (chapter.source === 'comick' || chapter.external_id?.startsWith('comick:'))) {
    const cleanHid = (chapter.external_id || '').replace(/^comick:/i, '');
    resolvedPages = await resolveComickPages(cleanHid);
  }

  // Branch C: External HTML link
  if (resolvedPages.length === 0 && chapter.external_id && chapter.external_id.startsWith('http')) {
    resolvedPages = await resolveExternalHtmlPages(chapter.external_id);
  }

  // Branch D: Check if pages array contains a single mirror page URL
  if (resolvedPages.length === 0 && Array.isArray(chapter.pages) && chapter.pages[0]?.startsWith('http')) {
    resolvedPages = await resolveExternalHtmlPages(chapter.pages[0]);
  }

  // 4. Update the DB asynchronously so the next reader gets it instantly
  if (resolvedPages.length > 0) {
    supabase
      .from('chapters')
      .update({ pages: resolvedPages, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then();

    return NextResponse.json({
      id: chapter.id,
      series_id: chapter.series_id,
      chapter_number: chapter.chapter_number,
      title: chapter.title,
      pages: resolvedPages,
      cached: false,
    });
  }

  return NextResponse.json(
    { error: 'Chapter is still resolving across mirrors. Please retry in a few seconds.' },
    { status: 503 }
  );
}
