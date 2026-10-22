import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

async function fetchComicKPages(hid: string) {
  try {
    const res = await fetch(`https://api.comick.io/chapter/${hid}`, { headers: HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.chapter?.images?.length) {
      return data.chapter.images.map((img: any) =>
        img.url.startsWith('http') ? img.url : `https://meo3.comick.pictures/${img.url}`
      );
    }
  } catch {}
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const chapterId = params.id;
  if (!chapterId) {
    return NextResponse.json({ error: 'Chapter ID required' }, { status: 400 });
  }

  try {
    // FIX: Added `base_url` to the select query!
    const { data: chapter, error } = await supabase
      .from('chapters')
      .select('id, series_id, chapter_number, base_url, pages, series (title, english_title, slug, cover_image_url)')
      .eq('id', chapterId)
      .single();

    if (error || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    // If already cached, return immediately
    if (Array.isArray(chapter.pages) && chapter.pages.length > 0) {
      return NextResponse.json(chapter);
    }

    // On-demand self-healing: Find and cache chapter right now
    const seriesObj = Array.isArray(chapter.series) ? chapter.series[0] : chapter.series;
    const searchTitle = seriesObj?.english_title || seriesObj?.title;

    if (searchTitle) {
      const searchRes = await fetch(
        `https://api.comick.io/v1.0/search?q=${encodeURIComponent(searchTitle)}&limit=1`,
        { headers: HEADERS }
      );
      const searchData = await searchRes.json();
      const meta = searchData?.[0];

      if (meta?.hid) {
        const chapRes = await fetch(
          `https://api.comick.io/comic/${meta.hid}/chapters?lang=en&limit=100`,
          { headers: HEADERS }
        );
        const chapData = await chapRes.json();
        const targetChapter = chapData?.chapters?.find(
          (c: any) => parseFloat(c.chap) === chapter.chapter_number
        );

        if (targetChapter?.hid) {
          const freshPages = await fetchComicKPages(targetChapter.hid);
          
          if (freshPages && freshPages.length > 0) {
            // METHOD A: COMPRESS URLs TO SAVE STORAGE ON SELF-HEAL
            let baseUrl = '';
            let compressedPages = freshPages;
            
            try {
              const urlObj = new URL(freshPages[0]);
              baseUrl = `${urlObj.protocol}//${urlObj.hostname}/`;
              compressedPages = freshPages.map((p: string) => p.startsWith(baseUrl) ? p.replace(baseUrl, '') : p);
            } catch {}

            await supabase
              .from('chapters')
              .update({ base_url: baseUrl, pages: compressedPages })
              .eq('id', chapter.id);

            chapter.base_url = baseUrl;
            chapter.pages = compressedPages;
          }
        }
      }
    }

    return NextResponse.json(chapter);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
