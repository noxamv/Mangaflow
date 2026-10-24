// app/api/proxy-image/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// Permanent wildcard pattern matching for any supported manga/manhwa CDN
const ALLOWED_CDN_PATTERNS = [
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
  'mangabat.com',
  'h.mangabat.com',
  'weebcentral.com',
];

function isAuthorizedCDN(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return ALLOWED_CDN_PATTERNS.some(
      (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl || !imageUrl.startsWith('http') || !isAuthorizedCDN(imageUrl)) {
    return new NextResponse('Forbidden or unauthorized image source', { status: 403 });
  }

  // Dynamic referrer matching: spoof target origin automatically
  let upstreamReferer = 'https://comick.io/';
  try {
    const parsed = new URL(imageUrl);
    if (parsed.hostname.includes('mangapill') || parsed.hostname.includes('readdetectiveconan')) {
      upstreamReferer = 'https://mangapill.com/';
    } else if (parsed.hostname.includes('mangadex')) {
      upstreamReferer = 'https://mangadex.org/';
    } else if (parsed.hostname.includes('asura')) {
      upstreamReferer = 'https://asuracomic.net/';
    } else if (parsed.hostname.includes('flame')) {
      upstreamReferer = 'https://flamecomics.xyz/';
    } else if (parsed.hostname.includes('mangabat')) {
      upstreamReferer = 'https://h.mangabat.com/';
    }
  } catch {}

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const upstreamRes = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': upstreamReferer,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!upstreamRes.ok) {
      return new NextResponse(`CDN error: ${upstreamRes.status}`, { status: upstreamRes.status });
    }

    const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await upstreamRes.arrayBuffer();

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Immutable cache: images never change once published
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Proxy connection failed';
    return new NextResponse(`Proxy error: ${message}`, { status: 500 });
  }
}
