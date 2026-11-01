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

// Upstream MangaDex Direct Image Resolver
async function resolveMangaDexImages(chapterUuid: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.mangadex.org/at-home/server/${chapterUuid}`, {
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

function isActualImage(url: string): boolean {
  if (!url) return false;
  const testUrl = url.includes('/api/proxy-image?url=')
    ? decodeURIComponent(url.split('/api/proxy-image?url=')[1])
    : url;

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
  if (!id) {
    return NextResponse.json({ error: 'Chapter ID required' }, { status: 400 });
  }

  try {
    // 1. Fetch Chapter Metadata from Supabase
    const { data: chapter, error: chError } = await supabase
      .from('chapters')
      .select('id, series_id, chapter_number, title, pages, base_url, source_id')
      .eq('id', id)
      .single();

    if (chError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    let finalPages: string[] = [];

    if (Array.isArray(chapter.pages) && chapter.pages.length > 0) {
      finalPages = chapter.pages;
    } else if (typeof chapter.pages === 'string' && chapter.pages.startsWith('[')) {
      try {
        finalPages = JSON.parse(chapter.pages);
      } catch {}
    }

    // 2. Resolve on-demand if pages are empty or invalid
    const hasRealImages = finalPages.length > 0 && isActualImage(finalPages[0]);
    if (!hasRealImages) {
      let resolved: string[] = [];

      if (chapter.source_id) {
        const cleanId = chapter.source_id.replace('mangadex:', '').trim();
        resolved = await resolveMangaDexImages(cleanId);
      }

      if (resolved.length > 0) {
        finalPages = resolved;
        // Asynchronously cache back to DB
        supabase
          .from('chapters')
          .update({ pages: resolved, updated_at: new Date().toISOString() })
          .eq('id', chapter.id)
          .then();
      }
    }

    // Wrap with edge proxy only if not already wrapped
    const cleanPages = finalPages.map((p) =>
      p.startsWith('/api/proxy-image') || p.startsWith('data:')
        ? p
        : `/api/proxy-image?url=${encodeURIComponent(p)}`
    );

    // 3. Fetch Series Metadata & Surrounding Chapters for Reader Controls
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
      base_url: chapter.base_url,
      pages: cleanPages,
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
