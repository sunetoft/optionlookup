import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bookmarks = await prisma.bookmark.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(bookmarks);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const ticker = (body?.ticker ?? '').toUpperCase().trim();

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    const bookmark = await prisma.bookmark.upsert({
      where: {
        userId_ticker: {
          userId: session.user.id,
          ticker,
        },
      },
      update: {},
      create: {
        userId: session.user.id,
        ticker,
      },
    });

    return NextResponse.json(bookmark, { status: 201 });
  } catch (error) {
    console.error('Bookmark error:', error);
    return NextResponse.json({ error: 'Failed to save bookmark' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ticker = (searchParams.get('ticker') ?? '').toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  try {
    await prisma.bookmark.deleteMany({
      where: {
        userId: session.user.id,
        ticker,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete bookmark error:', error);
    return NextResponse.json({ error: 'Failed to delete bookmark' }, { status: 500 });
  }
}
