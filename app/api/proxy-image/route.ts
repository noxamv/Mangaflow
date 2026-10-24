// app/api/proxy-image/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// Whitelist of legitimate upstream CDNs
const ALLOWED_CDN_DOMAINS = [
  'comick.pictures',
  'meo.comick.pictures',
  'meo2.comick.pictures',
  'meo3.comick.pictures',
  'mangadex.org',
  'uploads.mangadex.org',
  'mangapill.com',
  'readdetectiveconan.com',
  'mpcdn.top',
  'mpcdn.xyz',
  'asuracomic.net',
  'flamecomics.xyz',
];

function isSafeOrigin(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return ALLOWED_CDN_DOMAINS.some((domain) => url.hostname.endsWith(domain));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl || !imageUrl.startsWith('http') || !isSafeOrigin(imageUrl)) {
    return new NextResponse('Forbidden or invalid target CDN origin', { status: 403 });
  }

  let upstreamReferer = 'https://comick.io/';
  if (imageUrl.includes('mangapill.com') || imageUrl.includes('readdetectiveconan.com')) {
    upstreamReferer = 'https://mangapill.com/';
  } else if (imageUrl.includes('mangadex.org')) {
    upstreamReferer = 'https://mangadex.org/';
  }

  try {
    const upstreamRes = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
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
        // Immutable Edge & Browser Caching (1 Year)
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown proxy error';
    return new NextResponse(`Proxy error: ${message}`, { status: 500 });
  }
}
