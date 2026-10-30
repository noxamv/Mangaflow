// app/api/report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown-ip';
    const now = Date.now();

    const record = rateLimitMap.get(ip);
    if (record && now < record.resetTime) {
      if (record.count >= 5) {
        return NextResponse.json(
          { error: 'Too many reports submitted. Please wait a minute.' },
          { status: 429 }
        );
      }
      record.count++;
    } else {
      rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 });
    }

    const { chapterId, reason } = await req.json();

    if (!chapterId || typeof chapterId !== 'string') {
      return NextResponse.json({ error: 'Valid chapterId is required' }, { status: 400 });
    }

    const ipHash = crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);

    const { data: chap } = await supabaseAdmin
      .from('chapters')
      .select('id, series_id, external_id')
      .eq('id', chapterId)
      .maybeSingle();

    await supabaseAdmin.from('chapter_reports').insert({
      chapter_id: chapterId,
      reason: (reason || 'Broken/Missing Images').slice(0, 255),
      reporter_ip_hash: ipHash,
      status: 'pending',
    });

    // Self-Healing: Reset cached pages to external_id so next load re-resolves fresh CDN links,
    // and push parent series to the front of the sweeper queue.
    if (chap) {
      if (chap.external_id) {
        await supabaseAdmin
          .from('chapters')
          .update({ pages: [chap.external_id], updated_at: new Date().toISOString() })
          .eq('id', chap.id);
      }
      await supabaseAdmin
        .from('series_intel')
        .update({ next_scout_at: new Date(Date.now() - 60000).toISOString(), is_complete: false })
        .eq('series_id', chap.series_id);
    }

    return NextResponse.json({
      success: true,
      message: 'Report logged! Auto-repair has been triggered for this chapter.',
    });
  } catch {
    return NextResponse.json({ error: 'Failed to submit report' }, { status: 500 });
  }
}
