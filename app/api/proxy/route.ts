import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return new NextResponse('Invalid target URL', { status: 400 });
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Referer: 'https://mangadex.org/',
      },
    });

    if (!res.ok) {
      return new NextResponse(`Failed to fetch upstream: ${res.status}`, { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Cache images on browser and CDN for 7 days to eliminate repeated slow fetching
        'Cache-Control': 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400',
      },
    });
  } catch (err: any) {
    return new NextResponse(`Proxy error: ${err.message}`, { status: 500 });
  }
}
