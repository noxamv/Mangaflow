import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_PATTERNS = [
  'mangadex.org',
  'mangadex.network',
  'uploads.mangadex.org',
  'comick.io',
  'comick.pictures',
  'comick.fun',
  'comick.app',
  'mangapill.com',
  'mpcdn.xyz',
  'readdetectiveconan.com',
  'consumet.org',
];

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return new NextResponse('Invalid target URL', { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return new NextResponse('Malformed URL', { status: 400 });
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isAllowed = ALLOWED_PATTERNS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );

  if (!isAllowed) {
    return new NextResponse(`Target domain "${hostname}" not permitted`, { status: 403 });
  }

  // Proper upstream referer headers
  let upstreamReferer = 'https://mangadex.org/';
  if (hostname.includes('comick')) upstreamReferer = 'https://comick.io/';
  else if (hostname.includes('mangapill') || hostname.includes('mpcdn')) upstreamReferer = 'https://mangapill.com/';

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: upstreamReferer,
      },
    });

    if (!res.ok) {
      return new NextResponse(`Upstream returned ${res.status}`, { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';

    // Stream the body directly to avoid Vercel memory and buffer limits
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return new NextResponse(`Proxy error: ${err.message}`, { status: 500 });
  }
}
