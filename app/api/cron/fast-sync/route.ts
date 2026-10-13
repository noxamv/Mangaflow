import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Check authorization header
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // If CRON_SECRET is set, reject any request that doesn't provide it
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // If you run sync logic here, it will safely execute only when authorized
    return NextResponse.json({ success: true, message: 'Sync authorized and running' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
