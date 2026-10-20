import { NextRequest, NextResponse } from 'next/server';

// Whitelisted upstream image domains
const ALLOWED_DOMAINS = [
  'mangadex.org',
  'uploads.mangadex.org',
  'comick.io',
  'comick.pictures',
  'meo.comick.pictures',
  'meo3.comick.pictures',
  'mangapill.com',
  'consumet.org',
];

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

  // Domain security verification
  const isAllowed = ALLOWED_DOMAINS.some(
    (domain) =>
      parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
  );

  if (!isAllowed) {
    return new NextResponse('Target domain not permitted', { status: 403 });
  }

  // Dynamic referer matching based on provider
  let referer = 'https://mangadex.org/';
  if (parsedUrl.hostname.includes('comick')) {
    referer = 'https://comick.io/';
  } else if (parsedUrl.hostname.includes('mangapill')) {
    referer = 'https://mangapill.com/';
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: referer,
      },
    });

    if (!res.ok) {
      return new NextResponse(`Upstream responded with ${res.status}`, {
        status: res.status,
      });
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control':
          'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400',
      },
    });
  } catch (err: any) {
    return new NextResponse(`Proxy fetch error: ${err.message}`, { status: 500 });
  }
}
