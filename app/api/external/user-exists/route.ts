export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Secured with shared Bearer token (CROSS_SITE_API_KEY).
// TradeScouter calls this to check if an OptionLookup account exists for an email.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.CROSS_SITE_API_KEY;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get('email') ?? '').trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    return NextResponse.json({
      exists: !!user,
      userId: user?.id ?? null,
    });
  } catch (error) {
    console.error('user-exists error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
