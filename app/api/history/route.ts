import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const history = await prisma.analysisHistory.findMany({
    where: { userId: (session.user as any).id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      ticker: true,
      createdAt: true,
    },
  });

  return NextResponse.json(history);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { ticker, data } = body;

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    const entry = await prisma.analysisHistory.create({
      data: {
        userId: (session.user as any).id,
        ticker: ticker.toUpperCase(),
        data: data ?? {},
      },
    });

    return NextResponse.json({ id: entry.id }, { status: 201 });
  } catch (error) {
    console.error('History error:', error);
    return NextResponse.json({ error: 'Failed to save history' }, { status: 500 });
  }
}
