export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isAdminUser } from '@/lib/subscription';

/**
 * GET /api/scanner/heatmap
 * Admin-only — aggregates best CSP contracts across ALL users.
 * Returns top contracts ranked by ROI/day, with ticker/user count info.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const isAdmin = await isAdminUser(session.user.id);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Get all latest scan results across all users
  const allTickers = await prisma.scanTicker.findMany({
    include: {
      user: { select: { email: true } },
      scanResults: {
        orderBy: { roiPerDay: 'desc' },
        take: 5, // top 5 per ticker
      },
      scanRuns: {
        orderBy: { scannedAt: 'desc' },
        take: 1,
      },
    },
  });

  // Aggregate: per-ticker best contracts + user count
  const tickerMap = new Map<string, {
    ticker: string;
    userCount: number;
    bestRoi: number;
    bestContract: any | null;
    topContracts: any[];
    currentPrice: number | null;
    earningsDate: string | null;
    lastScanned: string | null;
  }>();

  for (const st of allTickers) {
    const existing = tickerMap.get(st.ticker) ?? {
      ticker: st.ticker,
      userCount: 0,
      bestRoi: 0,
      bestContract: null,
      topContracts: [],
      currentPrice: null,
      earningsDate: null,
      lastScanned: null,
    };
    existing.userCount++;
    if (st.scanResults.length > 0) {
      const best = st.scanResults[0];
      if (best.roiPerDay > existing.bestRoi) {
        existing.bestRoi = best.roiPerDay;
        existing.bestContract = best;
      }
      if (existing.topContracts.length === 0) {
        existing.topContracts = st.scanResults;
        existing.currentPrice = st.scanRuns[0]?.currentPrice ?? null;
        existing.earningsDate = st.scanRuns[0]?.earningsDate ?? null;
        existing.lastScanned = st.scanRuns[0]?.scannedAt?.toISOString() ?? null;
      }
    }
    tickerMap.set(st.ticker, existing);
  }

  // Sort by best ROI descending
  const heatmap = Array.from(tickerMap.values()).sort((a, b) => b.bestRoi - a.bestRoi);

  // Summary stats
  const totalUsers = await prisma.scanTicker.groupBy({
    by: ['userId'],
    _count: true,
  });
  const totalTickers = heatmap.length;
  const tickersWithContracts = heatmap.filter(h => h.bestRoi > 0).length;

  return NextResponse.json({
    heatmap,
    stats: {
      totalUsers: totalUsers.length,
      totalTickers,
      tickersWithContracts,
      totalScanTickers: allTickers.length,
    },
  });
}
