import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

// In-memory rate limiting: Max 5 reports per minute per IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown-ip';
    const now = Date.now();

    const record = rateLimitMap.get(ip);
    if (record) {
      if (now < record.resetTime) {
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
    } else {
      rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 });
    }

    const { chapterId, reason } = await req.json();

    if (!chapterId || typeof chapterId !== 'string') {
      return NextResponse.json(
        { error: 'Valid chapterId is required' },
        { status: 400 }
      );
    }

    const ipHash = crypto
      .createHash('sha256')
      .update(ip)
      .digest('hex')
      .substring(0, 16);

    const { error: insertError } = await supabaseAdmin
      .from('chapter_reports')
      .insert({
        chapter_id: chapterId,
        reason: (reason || 'Broken/Missing Images').slice(0, 255),
        reporter_ip_hash: ipHash,
        status: 'pending',
      });

    if (insertError) {
      console.error('Report insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to record report' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Thank you! The report has been logged and queued for inspection.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to submit report' },
      { status: 500 }
    );
  }
}
