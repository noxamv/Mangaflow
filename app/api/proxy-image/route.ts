import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl || !imageUrl.startsWith('http')) {
    return new NextResponse('Invalid or missing target image URL', { status: 400 });
  }

  // Determine the correct upstream referer required by the specific CDN
  let upstreamReferer = '';
  if (imageUrl.includes('readdetectiveconan.com') || imageUrl.includes('mangapill.com')) {
    upstreamReferer = 'https://mangapill.com/';
  } else if (imageUrl.includes('comick.pictures') || imageUrl.includes('comick')) {
    upstreamReferer = 'https://comick.io/';
  } else if (imageUrl.includes('mangadex.org') || imageUrl.includes('mangadex.network')) {
    upstreamReferer = 'https://mangadex.org/';
  }

  try {
    const upstreamRes = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': upstreamReferer,
      },
    });

    if (!upstreamRes.ok) {
      return new NextResponse(`Upstream CDN responded with status: ${upstreamRes.status}`, {
        status: upstreamRes.status,
      });
    }

    const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await upstreamRes.arrayBuffer();

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown proxy error';
    return new NextResponse(`Image Proxy Failure: ${message}`, { status: 500 });
  }
}
