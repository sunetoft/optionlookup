export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function verifyAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const expected = process.env.CROSS_SITE_API_KEY;
  return !!expected && authHeader === `Bearer ${expected}`;
}

// Create / upsert an imported stock for a user (called by TradeScouter)
export async function POST(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const email = (body?.email ?? '').trim().toLowerCase();
    const ticker = (body?.ticker ?? '').toUpperCase().trim();
    const source = (body?.source ?? 'tradescouter').trim() || 'tradescouter';

    if (!email || !ticker) {
      return NextResponse.json(
        { error: 'email and ticker are required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.importedStock.upsert({
      where: {
        userId_ticker_source: {
          userId: user.id,
          ticker,
          source,
        },
      },
      update: {},
      create: {
        userId: user.id,
        ticker,
        source,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('import-stock POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Delete an imported stock for a user (called by TradeScouter)
export async function DELETE(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const email = (body?.email ?? '').trim().toLowerCase();
    const ticker = (body?.ticker ?? '').toUpperCase().trim();
    const source = (body?.source ?? 'tradescouter').trim() || 'tradescouter';

    if (!email || !ticker) {
      return NextResponse.json(
        { error: 'email and ticker are required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      // Nothing to delete — respond success per contract (idempotent delete)
      return NextResponse.json({ success: true });
    }

    await prisma.importedStock.deleteMany({
      where: {
        userId: user.id,
        ticker,
        source,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('import-stock DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
