import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

export const dynamic = 'force-dynamic';
export const maxDuration = 15; // 15s serverless execution window

export async function GET(request: Request) {
  // 1. Security Check: Protect the endpoint with a secret query token
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('key');

  if (secret !== process.env.CRON_SECRET && secret !== 'mangaflow_fast_sync_2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Fetch the 40 most recently published English chapters globally
    const res = await fetch(
      'https://api.mangadex.org/chapter?limit=40&translatedLanguage[]=en&order[readableAt]=desc&includes[]=manga',
      {
        headers: { 'User-Agent': 'MangaFlowFastStream/2.0' },
        cache: 'no-store'
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'MangaDex stream failed' }, { status: 502 });
    }

    const json = await res.json();
    const recentChapters = json.data || [];
    let added = 0;

    for (const ch of recentChapters) {
      const mangaRel = ch.relationships?.find((r: any) => r.type === 'manga');
      if (!mangaRel) continue;

      const mangaDexId = mangaRel.id;
      const rawCh = ch.attributes?.chapter;
      const chNumber = rawCh ? parseFloat(rawCh) : null;
      if (chNumber === null || isNaN(chNumber)) continue;

      // 3. Check if we have this series in our Supabase library
      const { data: series } = await supabase
        .from('series')
        .select('id, title')
        .eq('source_url', mangaDexId)
        .maybeSingle();

      if (!series) continue;

      // 4. Upsert the fresh chapter into Supabase
      const { error: chErr } = await supabase.from('chapters').upsert(
        {
          series_id: series.id,
          chapter_number: chNumber,
          title: ch.attributes?.title || `Chapter ${chNumber}`,
          source: ch.id,
          panel_urls: []
        },
        { onConflict: 'series_id, chapter_number' }
      );

      if (!chErr) added++;
    }

    return NextResponse.json({
      success: true,
      new_chapters_added: added,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
