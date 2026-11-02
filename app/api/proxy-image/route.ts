// app/api/proxy-image/route.ts
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('Target URL is required', { status: 400 });
  }

  try {
    const parsedTarget = new URL(targetUrl);
    const host = parsedTarget.hostname.toLowerCase();

    // Map exact Referer based on the upstream mirror CDN
    let referer = '';
    if (host.includes('mpcdn.top') || host.includes('mangapill.com')) {
      referer = 'https://mangapill.com/';
    } else if (host.includes('mangadex.org') || host.includes('uploads.mangadex.org')) {
      referer = 'https://mangadex.org/';
    } else if (host.includes('weebcentral.com')) {
      referer = 'https://weebcentral.com/';
    } else if (host.includes('comick.io') || host.includes('comick.fun')) {
      referer = 'https://comick.io/';
    } else if (host.includes('manganato') || host.includes('chapmanganato')) {
      referer = 'https://chapmanganato.to/';
    }

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
    };

    if (referer) {
      headers['Referer'] = referer;
    }

    let upstreamRes = await fetch(targetUrl, {
      headers,
      signal: AbortSignal.timeout(12000),
    });

    // Fallback: If strict referer failed, retry with neutral headers
    if (!upstreamRes.ok) {
      delete headers['Referer'];
      upstreamRes = await fetch(targetUrl, {
        headers,
        signal: AbortSignal.timeout(12000),
      });
    }

    if (!upstreamRes.ok) {
      return new Response(`Upstream mirror error: ${upstreamRes.status}`, {
        status: upstreamRes.status,
      });
    }

    const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await upstreamRes.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.byteLength.toString(),
        // Cache images at edge for 30 days
        'Cache-Control': 'public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
}
