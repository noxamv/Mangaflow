// app/api/proxy-image/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = [
  'mangadex.org',
  'uploads.mangadex.org',
  'mangapill.com',
  'readdetectiveconan.com',
  'weebcentral.com',
  'temp.compsci88.com',
  'comick.fun',
  'comick.io',
  'comick.pictures',
  'meo.comick.pictures',
  'meo3.comick.pictures',
  'manganato.com',
  'chapmanganato.to',
  'natomanga.com',
  'hivetoons.org',
  'asuracomic.net',
  'asuratool.com',
  // MangaFire domains
  'mangafire.to',
  'static.mangafire.to',
  's1.mangafire.to',
  's2.mangafire.to'
];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) return new NextResponse('Missing image URL parameter', { status: 400 });

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      return new NextResponse('Invalid target image URL', { status: 400 });
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const isAllowed = ALLOWED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
    if (!isAllowed) return new NextResponse('Host domain not in image proxy allowlist', { status: 403 });

    let referer = `${parsedUrl.protocol}//${parsedUrl.host}/`;
    if (hostname.includes('mangapill') || hostname.includes('readdetectiveconan')) {
      referer = 'https://mangapill.com/';
    } else if (hostname.includes('weebcentral') || hostname.includes('compsci88')) {
      referer = 'https://weebcentral.com/';
    } else if (hostname.includes('manganato') || hostname.includes('chapmanganato') || hostname.includes('natomanga')) {
      referer = 'https://chapmanganato.to/';
    } else if (hostname.includes('mangafire')) {
      referer = 'https://mangafire.to/';
    }

    const upstreamRes = await fetch(imageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Referer: referer,
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      cache: 'force-cache'
    });

    if (!upstreamRes.ok) {
      return new NextResponse(`Failed to fetch upstream image: ${upstreamRes.statusText}`, { status: upstreamRes.status });
    }

    const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await upstreamRes.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, immutable'
      }
    });
  } catch (err: any) {
    return new NextResponse(err.message || 'Image Proxy Error', { status: 500 });
  }
}
