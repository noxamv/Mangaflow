import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { chapterId, reason } = await req.json();

    if (!chapterId) {
      return NextResponse.json({ error: 'Missing chapterId' }, { status: 400 });
    }

    // 1. Clear faulty image cache so the bot re-downloads it on priority
    await supabase.from('chapters').update({ pages: null }).eq('id', chapterId);

    // 2. Track report entry
    await supabase.from('chapter_reports').insert({
      chapter_id: chapterId,
      reason: reason || 'Broken/Missing Images',
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: 'Chapter queued for immediate repair' });
  } catch {
    return NextResponse.json({ success: true, message: 'Report received' });
  }
}
