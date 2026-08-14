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
        take: 10, // top 10 per ticker (covers both legs)
      },
      scanRuns: {
        orderBy: { scannedAt: 'desc' },
        take: 1,
      },
    },
  });

  // Aggregate: per-ticker best put + best call + user count
  const tickerMap = new Map<string, {
    ticker: string;
    userCount: number;
    bestRoi: number;
    bestContract: any | null;
    bestPut: any | null;
    bestCall: any | null;
    putCount: number;
    callCount: number;
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
      bestPut: null,
      bestCall: null,
      putCount: 0,
      callCount: 0,
      topContracts: [],
      currentPrice: null,
      earningsDate: null,
      lastScanned: null,
    };
    existing.userCount++;
    if (st.scanResults.length > 0) {
      const puts = st.scanResults.filter((r) => r.optionType === 'PUT');
      const calls = st.scanResults.filter((r) => r.optionType === 'CALL');
      existing.putCount += puts.length;
      existing.callCount += calls.length;

      if (puts.length > 0 && (!existing.bestPut || puts[0].roiPerDay > existing.bestPut.roiPerDay)) {
        existing.bestPut = puts[0];
      }
      if (calls.length > 0 && (!existing.bestCall || calls[0].roiPerDay > existing.bestCall.roiPerDay)) {
        existing.bestCall = calls[0];
      }

      const overallBest = st.scanResults[0];
      if (overallBest.roiPerDay > existing.bestRoi) {
        existing.bestRoi = overallBest.roiPerDay;
        existing.bestContract = overallBest;
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
  const totalPuts = heatmap.reduce((s, h) => s + h.putCount, 0);
  const totalCalls = heatmap.reduce((s, h) => s + h.callCount, 0);

  return NextResponse.json({
    heatmap,
    stats: {
      totalUsers: totalUsers.length,
      totalTickers,
      tickersWithContracts,
      totalScanTickers: allTickers.length,
      totalPuts,
      totalCalls,
    },
  });
}
