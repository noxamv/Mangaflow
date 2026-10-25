// app/api/chapter/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

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
        base_url,
        pages,
        created_at,
        updated_at,
        series:series_id (
          id,
          title,
          slug,
          cover_url
        )
      `)
      .eq('id', chapterId)
      .single();

    if (error || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    // Hybrid Storage Resolution: Stitch base_url + relative path on the fly
    const baseUrl = chapter.base_url ? chapter.base_url.replace(/\/$/, '') : '';
    const resolvedPages = (chapter.pages || []).map((page: string) => {
      if (!page) return '';
      if (page.startsWith('http://') || page.startsWith('https://')) {
        return page;
      }
      return baseUrl ? `${baseUrl}/${page.replace(/^\//, '')}` : page;
    }).filter(Boolean);

    // Fetch previous and next chapter IDs for instant navigation in the reader
    const [prevRes, nextRes] = await Promise.all([
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
    ]);

    return NextResponse.json({
      ...chapter,
      pages: resolvedPages,
      prevChapter: prevRes.data || null,
      nextChapter: nextRes.data || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
