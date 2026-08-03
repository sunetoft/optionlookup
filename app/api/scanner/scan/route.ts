export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scanTickerForCSP } from '@/lib/scanner-engine';

/**
 * POST /api/scanner/scan
 * Body: { ticker: string }
 *
 * Manually triggers a scan for the user's ticker.
 * Requires authentication. The ticker must exist in the user's ScanTicker watchlist.
 */
export async function POST(req: NextRequest) {
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

    // Find the user's scan ticker
    const scanTicker = await prisma.scanTicker.findFirst({
      where: { userId: session.user.id, ticker },
    });

    if (!scanTicker) {
      return NextResponse.json({ error: 'Ticker not found in your watchlist' }, { status: 404 });
    }

    // Run the scan
    const result = await scanTickerForCSP(ticker, scanTicker.priceTarget);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 503 });
    }

    // Create scan run + replace results (Option A)
    const scanRun = await prisma.scanRun.create({
      data: {
        userId: session.user.id,
        ticker,
        scanType: 'manual',
        totalPuts: result.stats.totalPutsChecked,
        qualifiedPuts: result.contracts.length,
        currentPrice: result.currentPrice,
        earningsDate: result.earningsDate,
        scanTickerId: scanTicker.id,
      },
    });

    // Delete old results for this ticker
    await prisma.scanResult.deleteMany({
      where: { scanTickerId: scanTicker.id },
    });

    // Insert new results
    if (result.contracts.length > 0) {
      await prisma.scanResult.createMany({
        data: result.contracts.map((c) => ({
          scanTickerId: scanTicker.id,
          scanRunId: scanRun.id,
          strike: c.strike,
          expiration: c.expiration,
          dte: c.dte,
          bid: c.bid,
          ask: c.ask,
          roiPerDay: c.roiPerDay,
          totalRoi: c.totalRoi,
          openInterest: c.openInterest,
          volume: c.volume,
          impliedVol: c.impliedVol,
          earningsWarning: c.earningsWarning,
          emWarning: c.emWarning,
        })),
      });
    }

    return NextResponse.json({
      ticker,
      currentPrice: result.currentPrice,
      earningsDate: result.earningsDate,
      earningsDaysAway: result.earningsDaysAway,
      contracts: result.contracts.slice(0, 50),
      totalFound: result.contracts.length,
      bestContract: result.bestContract,
      stats: result.stats,
      scannedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[SCANNER/SCAN] Error:', error);
    return NextResponse.json({ error: 'Failed to scan ticker' }, { status: 500 });
  }
}
