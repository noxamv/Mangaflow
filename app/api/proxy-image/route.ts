// app/api/proxy-image/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ALLOWED_DOMAINS = [
  'mangadex.org',
  'uploads.mangadex.org',
  'mangapill.com',
  'readdetectiveconan.com',
  'hivetoons.org',
  'asuracomic.net',
  'asuratool.com',
  'reaperscans.com',
  'flamecomics.xyz',
  'comick.fun',
  'comick.io',
  'comick.pictures',
  'meo.comick.pictures',
  'meo3.comick.pictures',
  'toonily.com',
  'toongod.org',
  'wp.com'
];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');

  if (!url) {
    return new NextResponse('Image URL is required', { status: 400 });
  }

  try {
    const targetUrl = new URL(url);
    const hostname = targetUrl.hostname;

    const isAllowed = ALLOWED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      return new NextResponse('Domain not allowed', { status: 403 });
    }

    // Determine correct Referer based on target CDN
    let referer = `${targetUrl.protocol}//${targetUrl.host}/`;
    if (hostname.includes('readdetectiveconan.com') || hostname.includes('mangapill.com')) {
      referer = 'https://mangapill.com/';
    } else if (hostname.includes('hivetoons.org')) {
      referer = 'https://hivetoons.org/';
    } else if (hostname.includes('comick')) {
      referer = 'https://comick.io/';
    }

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Referer': referer,
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    };

    const upstreamResponse = await fetch(url, { headers });

    if (!upstreamResponse.ok) {
      return new NextResponse(`Failed to fetch image: ${upstreamResponse.statusText}`, {
        status: upstreamResponse.status,
      });
    }

    const contentType = upstreamResponse.headers.get('content-type') || 'image/jpeg';
    const buffer = await upstreamResponse.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    });
  } catch (error: any) {
    return new NextResponse(`Internal error: ${error.message}`, { status: 500 });
  }
}
