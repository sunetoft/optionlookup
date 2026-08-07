export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canAddScannerTicker, FREE_SCANNER_TICKER_LIMIT } from '@/lib/subscription';

/**
 * GET /api/scanner/tickers
 * Returns the user's scan tickers with latest scan results.
 *
 * POST /api/scanner/tickers
 * Body: { ticker: string, priceTarget: number }
 * Adds a ticker to the user's watchlist (respects tier limits).
 *
 * DELETE /api/scanner/tickers
 * Body: { ticker: string }
 * Removes a ticker from the user's watchlist.
 */

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const tickers = await prisma.scanTicker.findMany({
    where: { userId: session.user.id },
    include: {
      category: true,
      scanResults: {
        orderBy: { roiPerDay: 'desc' },
        take: 50,
      },
      scanRuns: {
        orderBy: { scannedAt: 'desc' },
        take: 10,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const access = await canAddScannerTicker(session.user.id);

  return NextResponse.json({
    tickers: tickers.map((t) => ({
      id: t.id,
      ticker: t.ticker,
      priceTarget: t.priceTarget,
      categoryId: t.categoryId,
      category: t.category ? { id: t.category.id, name: t.category.name, color: t.category.color } : null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      latestResults: t.scanResults,
      scanRuns: t.scanRuns.map((r) => ({
        id: r.id,
        scanType: r.scanType,
        qualifiedPuts: r.qualifiedPuts,
        qualifiedCalls: r.qualifiedCalls,
        currentPrice: r.currentPrice,
        earningsDate: r.earningsDate,
        scannedAt: r.scannedAt.toISOString(),
      })),
    })),
    tierInfo: {
      limit: access.unlimited ? null : FREE_SCANNER_TICKER_LIMIT,
      current: access.current,
      unlimited: access.unlimited,
      canAdd: access.allowed,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const ticker = (body?.ticker ?? '').toUpperCase().trim();
    const priceTarget = parseFloat(body?.priceTarget);

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }
    if (!priceTarget || priceTarget <= 0) {
      return NextResponse.json({ error: 'Valid price target is required' }, { status: 400 });
    }

    // Check tier limit
    const access = await canAddScannerTicker(session.user.id);
    if (!access.allowed) {
      return NextResponse.json({
        error: 'TIER_LIMIT_REACHED',
        message: `Free tier limit: ${FREE_SCANNER_TICKER_LIMIT} tickers. Upgrade for unlimited.`,
        limit: FREE_SCANNER_TICKER_LIMIT,
      }, { status: 403 });
    }

    // Check for duplicate
    const existing = await prisma.scanTicker.findFirst({
      where: { userId: session.user.id, ticker },
    });
    if (existing) {
      // Update price target
      const updated = await prisma.scanTicker.update({
        where: { id: existing.id },
        data: { priceTarget },
      });
      return NextResponse.json({ ticker: updated, message: 'Price target updated' });
    }

    const scanTicker = await prisma.scanTicker.create({
      data: {
        userId: session.user.id,
        ticker,
        priceTarget,
      },
    });

    return NextResponse.json({ ticker: scanTicker, message: 'Ticker added to watchlist' });
  } catch (error: any) {
    console.error('[SCANNER/TICKERS] POST error:', error);
    return NextResponse.json({ error: 'Failed to add ticker' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const ticker = (body?.ticker ?? '').toUpperCase().trim();

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    await prisma.scanTicker.deleteMany({
      where: { userId: session.user.id, ticker },
    });

    return NextResponse.json({ message: 'Ticker removed from watchlist' });
  } catch (error: any) {
    console.error('[SCANNER/TICKERS] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to remove ticker' }, { status: 500 });
  }
}

/**
 * PATCH /api/scanner/tickers
 * Body: { ticker: string, categoryId: string | null }
 * Updates a ticker's category assignment.
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const ticker = (body?.ticker ?? '').toUpperCase().trim();
    const categoryId = body?.categoryId ?? null;

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    // If setting a category, verify ownership
    if (categoryId) {
      const category = await prisma.scanCategory.findFirst({
        where: { id: categoryId, userId: session.user.id },
      });
      if (!category) {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 });
      }
    }

    const updated = await prisma.scanTicker.updateMany({
      where: { userId: session.user.id, ticker },
      data: { categoryId: categoryId || null },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: 'Ticker not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Category updated', ticker, categoryId });
  } catch (error: any) {
    console.error('[SCANNER/TICKERS] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
  }
}
