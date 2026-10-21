import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ROOTS = [
  'mangadex.org',
  'comick.io',
  'comick.pictures',
  'mangapill.com',
  'readdetectiveconan.com',
  'consumet.org',
  'meo.comick.pictures',
  'meo2.comick.pictures',
  'meo3.comick.pictures',
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
  const isAllowed = ALLOWED_ROOTS.some(
    (root) => hostname === root || hostname.endsWith(`.${root}`)
  );

  if (!isAllowed) {
    return new NextResponse('Target domain not permitted', { status: 403 });
  }

  let referer = 'https://mangadex.org/';
  if (hostname.includes('comick')) referer = 'https://comick.io/';
  else if (hostname.includes('mangapill')) referer = 'https://mangapill.com/';

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
        // Immutable cache for fast panel flips and low bandwidth
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err: any) {
    return new NextResponse(`Proxy fetch error: ${err.message}`, { status: 500 });
  }
}
