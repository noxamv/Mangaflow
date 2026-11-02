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
    
    // Set the exact upstream Referer header required to bypass CDN hotlink protections
    let referer = '';
    const host = parsedTarget.hostname.toLowerCase();

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

    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        ...(referer ? { Referer: referer } : {}),
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    if (!upstreamRes.ok) {
      // Fallback: If strict referer failed, attempt direct fetch with neutral headers
      const retryRes = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        },
      });

      if (!retryRes.ok) {
        return new Response(`Upstream mirror error: ${retryRes.status}`, {
          status: retryRes.status,
        });
      }

      const contentType = retryRes.headers.get('content-type') || 'image/jpeg';
      return new Response(retryRes.body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400',
          'Access-Control-Allow-Origin': '*',
        },
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
