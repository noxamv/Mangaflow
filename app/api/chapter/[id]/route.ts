import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const chapterId = params.id;

  // 1. Check the chapter record in Supabase
  const { data: chapter, error } = await supabase
    .from('chapters')
    .select('id, source, source_provider')
    .eq('id', chapterId)
    .single();

  if (error || !chapter) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }

  try {
    let imageUrls: string[] = [];

    // ==========================================
    // CASE A: CHAPTER IS FROM THE MIRROR
    // ==========================================
    if (chapter.source_provider === 'mirror') {
      // chapter.source holds the mirror HID (e.g. "comick chapter hid")
      const res = await fetch(`https://api.comick.fun/chapter/${chapter.source}`, {
        headers: { 'User-Agent': 'MangaFlow/1.0' },
        cache: 'no-store',
      });
      const data = await res.json();

      // Convert mirror image keys into direct CDN links
      if (data?.chapter?.images) {
        imageUrls = data.chapter.images.map(
          (img: { b2key: string }) =>
            `/api/proxy-image?url=${encodeURIComponent(`https://meo.comick.pictures/${img.b2key}`)}`
        );
      }
    } 
    // ==========================================
    // CASE B: CHAPTER IS FROM MANGADEX
    // ==========================================
    else {
      // chapter.source holds MangaDex chapter UUID
      const res = await fetch(`https://api.mangadex.org/at-home/server/${chapter.source}`);
      const data = await res.json();

      const host = data?.baseUrl;
      const hash = data?.chapter?.hash;
      const files = data?.chapter?.data || [];

      imageUrls = files.map(
        (file: string) =>
          `/api/proxy-image?url=${encodeURIComponent(`${host}/data/${hash}/${file}`)}`
      );
    }

    return NextResponse.json({ images: imageUrls });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
