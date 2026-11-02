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
  'Accept-Language': 'en-US,en;q=0.9',
};

// 1. Resolve MangaDex Direct Images via Official At-Home API
async function resolveMangaDexImages(chapterUuid: string): Promise<string[]> {
  try {
    const cleanId = chapterUuid.replace('mangadex:', '').trim();
    const res = await fetch(`https://api.mangadex.org/at-home/server/${cleanId}`, {
      headers: { 'User-Agent': 'MangaFlow/1.0' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const baseUrl = data.baseUrl;
    const hash = data.chapter?.hash;
    const files = data.chapter?.data || [];
    if (!baseUrl || !hash || !files.length) return [];

    return files.map((file: string) => `${baseUrl}/data/${hash}/${file}`);
  } catch {
    return [];
  }
}

// 2. Resolve Comick Direct Images via Public API
async function resolveComickImages(hid: string): Promise<string[]> {
  try {
    const cleanHid = hid.replace('comick:', '').trim();
    const res = await fetch(`https://api.comick.fun/chapter/${cleanHid}`, {
      headers: HEADERS,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const chapter = data.chapter;
    if (!chapter?.images || !Array.isArray(chapter.images)) return [];

    return chapter.images
      .filter((img: any) => img?.url)
      .map((img: any) => img.url);
  } catch {
    return [];
  }
}

// 3. Resolve MangaPill, WeebCentral, and generic mirrors by parsing chapter HTML
async function scrapeDirectImagesFromWebpage(pageUrl: string): Promise<string[]> {
  try {
    let referer = '';
    if (pageUrl.includes('mangapill.com')) referer = 'https://mangapill.com/';
    if (pageUrl.includes('weebcentral.com')) referer = 'https://weebcentral.com/';

    const res = await fetch(pageUrl, {
      headers: { ...HEADERS, Referer: referer },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const imageUrls: string[] = [];

    // Check custom chapter image containers across standard manga mirrors
    $('picture img, div.container img, div.space-y-3 img, #chapter-container img, img').each((_, el) => {
      const src =
        $(el).attr('data-src') ||
        $(el).attr('data-lazy-src') ||
        $(el).attr('data-original') ||
        $(el).attr('src');

      if (!src) return;

      const cleanSrc = src.trim();
      const isBadAsset =
        cleanSrc.includes('logo') ||
        cleanSrc.includes('avatar') ||
        cleanSrc.includes('banner') ||
        cleanSrc.includes('icon') ||
        cleanSrc.endsWith('.svg') ||
        cleanSrc.includes('placeholder');

      if (!isBadAsset && (cleanSrc.startsWith('http://') || cleanSrc.startsWith('https://'))) {
        imageUrls.push(cleanSrc);
      }
    });

    return imageUrls;
  } catch {
    return [];
  }
}

function isDirectImage(url: string): boolean {
  if (!url) return false;
  const testUrl = url.includes('/api/proxy-image?url=')
    ? decodeURIComponent(url.split('/api/proxy-image?url=')[1])
    : url;

  // Webpage reader links are NOT direct images
  if (
    testUrl.includes('mangadex.org/chapter/') ||
    testUrl.includes('mangapill.com/chapters/') ||
    testUrl.includes('weebcentral.com/chapters/') ||
    testUrl.includes('comick.io/chapter/') ||
    testUrl.includes('chapmanganato.to/')
  ) {
    return false;
  }

  return (
    testUrl.match(/\.(jpeg|jpg|png|webp|avif)(\?.*)?$/i) !== null ||
    testUrl.includes('/data/') ||
    testUrl.includes('uploads.mangadex.org') ||
    testUrl.includes('mpcdn.top')
  );
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Missing chapter ID' }, { status: 400 });
  }

  try {
    // 1. Fetch chapter record from Supabase
    const { data: chapter, error: chError } = await supabase
      .from('chapters')
      .select('*')
      .eq('id', id)
      .single();

    if (chError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    let rawPages: string[] = [];
    if (Array.isArray(chapter.pages) && chapter.pages.length > 0) {
      rawPages = chapter.pages;
    } else if (typeof chapter.pages === 'string' && chapter.pages.startsWith('[')) {
      try {
        rawPages = JSON.parse(chapter.pages);
      } catch {}
    }

    let resolvedImages: string[] = [];

    // Check if pages are already verified direct image URLs
    if (rawPages.length > 0 && isDirectImage(rawPages[0])) {
      resolvedImages = rawPages;
    } else {
      // 2. Identify the upstream identifier (from external_id, source_id, or first page URL)
      const upstreamRef =
        chapter.external_id ||
        chapter.source_id ||
        (rawPages.length > 0 ? rawPages[0] : '');

      if (upstreamRef.includes('mangadex:') || upstreamRef.includes('mangadex.org/chapter/')) {
        const uuid = upstreamRef.replace('mangadex:', '').match(/([a-f0-9-]{36})/)?.[1] || upstreamRef.replace('mangadex:', '').trim();
        resolvedImages = await resolveMangaDexImages(uuid);
      } else if (upstreamRef.includes('comick:') || upstreamRef.includes('comick.io/chapter/')) {
        const hid = upstreamRef.replace('comick:', '').trim();
        resolvedImages = await resolveComickImages(hid);
      } else if (upstreamRef.startsWith('http://') || upstreamRef.startsWith('https://')) {
        resolvedImages = await scrapeDirectImagesFromWebpage(upstreamRef);
      }

      // If resolved, asynchronously cache real direct images back to Supabase
      if (resolvedImages.length > 0) {
        supabase
          .from('chapters')
          .update({ pages: resolvedImages, updated_at: new Date().toISOString() })
          .eq('id', id)
          .then();
      }
    }

    // 3. Fallback: If still empty, return graceful 404
    if (!resolvedImages || resolvedImages.length === 0) {
      return NextResponse.json(
        { error: 'Chapter images are currently unavailable from upstream providers.' },
        { status: 503 }
      );
    }

    // Wrap with edge proxy
    const finalPages = resolvedImages.map((img) =>
      img.startsWith('/api/proxy-image') || img.startsWith('data:')
        ? img
        : `/api/proxy-image?url=${encodeURIComponent(img)}`
    );

    // 4. Fetch Series Metadata & Adjacent Chapters for Reader Navigation
    const [seriesRes, allChaptersRes] = await Promise.all([
      supabase
        .from('series')
        .select('id, slug, title, reading_mode')
        .eq('id', chapter.series_id)
        .single(),
      supabase
        .from('chapters')
        .select('id, chapter_number')
        .eq('series_id', chapter.series_id)
        .order('chapter_number', { ascending: false }),
    ]);

    const allChapters = allChaptersRes.data || [];
    const currentIndex = allChapters.findIndex((c) => c.id === chapter.id);

    const prevChapter =
      currentIndex !== -1 && currentIndex < allChapters.length - 1
        ? allChapters[currentIndex + 1]
        : null;

    const nextChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;

    return NextResponse.json({
      id: chapter.id,
      series_id: chapter.series_id,
      chapter_number: chapter.chapter_number,
      title: chapter.title,
      pages: finalPages,
      series: seriesRes.data || null,
      allChapters,
      prevChapter,
      nextChapter,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
