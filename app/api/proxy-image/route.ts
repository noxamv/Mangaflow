// app/api/proxy-image/route.ts
export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('Target URL is required', { status: 400 });
  }

  try {
    const parsedTarget = new URL(targetUrl);
    
    // Choose the appropriate referrer based on the upstream host
    let referer = '';
    if (parsedTarget.hostname.includes('manganato') || parsedTarget.hostname.includes('chapmanganato')) {
      referer = 'https://chapmanganato.to/';
    } else if (parsedTarget.hostname.includes('comick')) {
      referer = 'https://comick.io/';
    } else if (parsedTarget.hostname.includes('weebcentral')) {
      referer = 'https://weebcentral.com/';
    }

    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        Referer: referer,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    if (!upstreamRes.ok) {
      return new Response(`Upstream mirror error: ${upstreamRes.status}`, {
        status: upstreamRes.status,
      });
    }

    const contentType = upstreamRes.headers.get('content-type') || 'image/jpeg';

    return new Response(upstreamRes.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Global edge caching: 30 days
        'Cache-Control': 'public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
}
