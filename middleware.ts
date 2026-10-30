// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const BLOCKED_BOTS = [
  'python-requests',
  'scrapy',
  'curl/',
  'wget/',
  'headlesschrome',
  'phantomjs',
  'selenium',
  'puppeteer',
  'Playwright',
  'aiohttp',
  'go-http-client',
];

export function middleware(req: NextRequest) {
  const ua = (req.headers.get('user-agent') || '').toLowerCase();

  // Block known scraping scripts from hitting API and Reader endpoints
  if (req.nextUrl.pathname.startsWith('/api/')) {
    if (!ua || BLOCKED_BOTS.some((bot) => ua.includes(bot.toLowerCase()))) {
      return new NextResponse(JSON.stringify({ error: 'Automated access denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
