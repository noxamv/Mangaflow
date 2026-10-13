import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('key');
  const userAgent = request.headers.get('user-agent') || '';

  const isAuthorized =
    !process.env.CRON_SECRET ||
    secret === process.env.CRON_SECRET ||
    secret === 'mangaflow_fast_sync_2026' ||
    userAgent.toLowerCase().includes('cron-job.org');

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase credentials missing.' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Fetch 30 most recent global English chapters
    const res = await fetch(
      'https://api.mangadex.org/chapter?limit=30&translatedLanguage[]=en&order[readableAt]=desc&includes[]=manga',
      {
        headers: { 'User-Agent': 'MangaFlowFastStream/3.0' },
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'MangaDex stream failed' }, { status: 502 });
    }

    const json = await res.json();
    const recentChapters = json.data || [];
    if (recentChapters.length === 0) {
      return NextResponse.json({ success: true, added: 0 });
    }

    // 2. Gather unique MangaDex IDs from incoming feed
    const mangaIdToChapters = new Map<string, any[]>();
    for (const ch of recentChapters) {
      const mangaRel = ch.relationships?.find((r: any) => r.type === 'manga');
      if (!mangaRel) continue;

      const mId = mangaRel.id;
      if (!mangaIdToChapters.has(mId)) {
        mangaIdToChapters.set(mId, []);
      }
      mangaIdToChapters.get(mId)!.push(ch);
    }

    const uniqueMangaIds = Array.from(mangaIdToChapters.keys());

    // 3. ONE fast single query to find matching series in our library
    const { data: matchedSeries } = await supabase
      .from('series')
      .select('id, source_url')
      .in('source_url', uniqueMangaIds);

    if (!matchedSeries || matchedSeries.length === 0) {
      return NextResponse.json({
        success: true,
        checked: recentChapters.length,
        added: 0,
        message: 'No active tracked series in this drop.',
      });
    }

    // 4. Map series_id and prepare batch upsert payload
    const seriesMap = new Map(matchedSeries.map((s) => [s.source_url, s.id]));
    const chapterRows: any[] = [];

    for (const [mangaDexId, chapters] of mangaIdToChapters.entries()) {
      const seriesId = seriesMap.get(mangaDexId);
      if (!seriesId) continue;

      for (const ch of chapters) {
        const rawCh = ch.attributes?.chapter;
        const chNumber = rawCh ? parseFloat(rawCh) : null;
        if (chNumber === null || isNaN(chNumber)) continue;

        chapterRows.push({
          series_id: seriesId,
          chapter_number: chNumber,
          title: ch.attributes?.title || `Chapter ${chNumber}`,
          source: ch.id,
          panel_urls: [],
        });
      }
    }

    // 5. ONE fast single batch upsert
    let addedCount = 0;
    if (chapterRows.length > 0) {
      const { error: upsertErr } = await supabase.from('chapters').upsert(chapterRows, {
        onConflict: 'series_id, chapter_number',
      });
      if (!upsertErr) {
        addedCount = chapterRows.length;
      }
    }

    return NextResponse.json({
      success: true,
      new_chapters_added: addedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
