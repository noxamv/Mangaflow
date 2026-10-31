// app/api/chapter/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
  auth: { persistSession: false },
});

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
};

// 1. Resolve true image files from MangaDex At-Home Network
async function resolveMangaDexImages(chapterId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.mangadex.org/at-home/server/${chapterId}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const baseUrl = data.baseUrl;
    const hash = data.chapter?.hash;
    const files = data.chapter?.data || [];

    if (!baseUrl || !hash || files.length === 0) return [];

    return files.map(
      (file: string) => `/api/proxy-image?url=${encodeURIComponent(`${baseUrl}/data/${hash}/${file}`)}`
    );
  } catch {
    return [];
  }
}

// 2. Resolve true image files by parsing mirror HTML (MangaPill, WeebCentral, etc.)
async function scrapeDirectImagesFromWebpage(pageUrl: string): Promise<string[]> {
  try {
    const res = await fetch(pageUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const imageUrls: string[] = [];

    // Match image elements across various reader DOM structures
    $('img').each((_, el) => {
      const src =
        $(el).attr('data-src') ||
        $(el).attr('data-lazy-src') ||
        $(el).attr('data-original') ||
        $(el).attr('src');

      if (!src) return;

      const cleanSrc = src.trim();
      const isAdOrIcon =
        cleanSrc.includes('logo') ||
        cleanSrc.includes('avatar') ||
        cleanSrc.includes('banner') ||
        cleanSrc.includes('icon') ||
        cleanSrc.endsWith('.svg');

      if (!isAdOrIcon && (cleanSrc.startsWith('http://') || cleanSrc.startsWith('https://'))) {
        imageUrls.push(`/api/proxy-image?url=${encodeURIComponent(cleanSrc)}`);
      }
    });

    return imageUrls;
  } catch {
    return [];
  }
}

function isActualImage(url: string): boolean {
  if (!url) return false;
  // If it's already proxied, check the inner URL
  const testUrl = url.includes('/api/proxy-image?url=')
    ? decodeURIComponent(url.split('/api/proxy-image?url=')[1])
    : url;

  // If it's a webpage URL (like mangadex.org/chapter/XYZ or mangapill.com/chapters/...), it's NOT an image!
  if (
    testUrl.includes('mangadex.org/chapter/') ||
    testUrl.includes('mangapill.com/chapters/') ||
    testUrl.includes('weebcentral.com/chapters/')
  ) {
    return false;
  }

  return (
    testUrl.match(/\.(jpeg|jpg|png|webp|avif)(\?.*)?$/i) !== null ||
    testUrl.includes('/data/') ||
    testUrl.includes('uploads.mangadex.org')
  );
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  const { data: chapter, error } = await supabase
    .from('chapters')
    .select('id, series_id, chapter_number, title, pages, external_id, source')
    .eq('id', id)
    .single();

  if (error || !chapter) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }

  // Check if existing pages are already direct images
  const existingPages: string[] = Array.isArray(chapter.pages) ? chapter.pages : [];
  const hasRealImages = existingPages.length > 0 && isActualImage(existingPages[0]);

  if (hasRealImages) {
    return NextResponse.json({
      id: chapter.id,
      series_id: chapter.series_id,
      chapter_number: chapter.chapter_number,
      title: chapter.title,
      pages: existingPages.map((p) =>
        p.startsWith('/api/proxy-image') ? p : `/api/proxy-image?url=${encodeURIComponent(p)}`
      ),
      cached: true,
    });
  }

  // If pages are empty or contain invalid webpage links, resolve direct images
  let resolvedImages: string[] = [];

  // A. MangaDex resolution via chapter UUID
  let mdUuid = '';
  if (chapter.external_id && chapter.external_id.includes('mangadex:')) {
    mdUuid = chapter.external_id.replace('mangadex:', '').trim();
  } else if (existingPages[0]?.includes('mangadex.org/chapter/')) {
    mdUuid = existingPages[0].match(/chapter\/([a-f0-9-]{36})/)?.[1] || '';
  }

  if (mdUuid) {
    resolvedImages = await resolveMangaDexImages(mdUuid);
  }

  // B. Fallback: Parse mirror HTML if the stored entry is a chapter webpage URL
  if (resolvedImages.length === 0 && existingPages.length > 0 && existingPages[0].startsWith('http')) {
    resolvedImages = await scrapeDirectImagesFromWebpage(existingPages[0]);
  }

  // C. Fallback: Parse external_id if it's an HTTP webpage link
  if (resolvedImages.length === 0 && chapter.external_id && chapter.external_id.startsWith('http')) {
    resolvedImages = await scrapeDirectImagesFromWebpage(chapter.external_id);
  }

  if (resolvedImages.length > 0) {
    // Update DB asynchronously with direct image links
    supabase
      .from('chapters')
      .update({ pages: resolvedImages })
      .eq('id', id)
      .then();

    return NextResponse.json({
      id: chapter.id,
      series_id: chapter.series_id,
      chapter_number: chapter.chapter_number,
      title: chapter.title,
      pages: resolvedImages,
      cached: false,
    });
  }

  return NextResponse.json(
    { error: 'Chapter images are currently unavailable from upstream providers.' },
    { status: 503 }
  );
}
