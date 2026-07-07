export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Internal endpoint for the OptionLookup dashboard.
// Returns the tickers imported from TradeScouter for the current user.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stocks = await prisma.importedStock.findMany({
      where: {
        userId: session.user.id,
        source: 'tradescouter',
      },
      orderBy: { createdAt: 'desc' },
      select: { ticker: true },
    });

    return NextResponse.json({
      stocks: stocks.map((s) => s.ticker),
    });
  } catch (error) {
    console.error('tradescouter stocks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Delete an imported stock for the current user
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const ticker = (body?.ticker ?? '').toString().toUpperCase().trim();

    if (!ticker) {
      return NextResponse.json({ error: 'ticker is required' }, { status: 400 });
    }

    await prisma.importedStock.deleteMany({
      where: {
        userId: session.user.id,
        ticker,
        source: 'tradescouter',
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('tradescouter stocks DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
