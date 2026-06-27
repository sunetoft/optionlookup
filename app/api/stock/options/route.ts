export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  isAlpacaConfigured,
  fetchAlpacaExpirationDates,
  fetchAlpacaPutOptions,
  AlpacaOptionContract,
} from '@/lib/alpaca-client';

type DataSource = 'yahoo' | 'alpaca';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getYF() {
  const YahooFinance = (await import('yahoo-finance2')).default;
  return new (YahooFinance as any)({ suppressNotices: ['yahooSurvey'] });
}

async function yahooGetExpirationDates(ticker: string): Promise<Date[]> {
  const yf = await getYF();
  const optData: any = await yf.options(ticker);
  return (optData?.expirationDates ?? [])
    .map((d: any) => new Date(d))
    .filter((d: Date) => d > new Date())
    .sort((a: Date, b: Date) => a.getTime() - b.getTime());
}

async function yahooGetPutsForDate(ticker: string, expDate: Date): Promise<any[]> {
  const yf = await getYF();
  const optData: any = await yf.options(ticker, { date: expDate });
  return optData?.options?.[0]?.puts ?? [];
}

async function alpacaScanPuts(
  ticker: string,
  currentPrice: number,
  earningsDateObj: Date | null,
  expectedMoves: any[],
  timesfmEm: any | null,
) {
  console.log('[OPTIONS/ALPACA] Using Alpaca as data source');

  const now = new Date();

  // Step 1: Get expiration dates from Trading API
  const allExpirations = await fetchAlpacaExpirationDates(ticker);
  console.log(`[OPTIONS/ALPACA] Found ${allExpirations.length} expiration dates`);

  // Filter by earnings date if present AND in the future
  const futureEarnings = earningsDateObj && earningsDateObj > now ? earningsDateObj : null;
  const validExpirations = futureEarnings
    ? allExpirations.filter((d) => new Date(d + 'T00:00:00Z') < futureEarnings)
    : allExpirations;

  console.log(`[OPTIONS/ALPACA] Valid expirations after earnings filter: ${validExpirations.length}`);

  const qualifiedPuts: any[] = [];
  let totalPutsChecked = 0;
  let datesScanned = 0;
  const rejectionStats = { lowStrike: 0, noBid: 0, lowRoi: 0, aboveLowerBound: 0 };

  // Step 2: Scan each expiration with tight strike range near ATM
  for (const expStr of validExpirations) {
    const expDate = new Date(expStr + 'T00:00:00Z');
    const dte = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (dte <= 0) continue;

    datesScanned++;
    const lowerBound = calcLowerBound(expStr, dte, currentPrice, expectedMoves);

    // Tight strike range: 70% of price to lowerBound + small buffer
    const minStrike = Math.floor(currentPrice * 0.7);
    const maxStrike = Math.ceil(Math.min(currentPrice, lowerBound + (currentPrice * 0.05)));

    if (maxStrike < minStrike) {
      console.log(`[OPTIONS/ALPACA] ${expStr} DTE:${dte} LB:$${lowerBound.toFixed(2)} — strike range invalid, skipping`);
      continue;
    }

    const putsForExp = await fetchAlpacaPutOptions(ticker, {
      expirationDateGte: expStr,
      expirationDateLte: expStr,
      strikePriceGte: minStrike,
      strikePriceLte: maxStrike,
      limit: 100,
    });

    console.log(`[OPTIONS/ALPACA] ${expStr} DTE:${dte} LB:$${lowerBound.toFixed(2)} Puts:${putsForExp.length} (strikes ${minStrike}-${maxStrike})`);

    for (const put of putsForExp) {
      totalPutsChecked++;
      const { strike, bid } = put;

      if (strike < currentPrice * 0.5) { rejectionStats.lowStrike++; continue; }
      if (bid <= 0) { rejectionStats.noBid++; continue; }

      const roiPerDay = (bid / strike / dte) * 100;
      if (roiPerDay <= 0.09) { rejectionStats.lowRoi++; continue; }
      if (strike > lowerBound) { rejectionStats.aboveLowerBound++; continue; }

      qualifiedPuts.push({
        strike,
        expiration: expStr,
        dte,
        premium: bid,
        bid,
        ask: put.ask,
        lastPrice: put.lastPrice,
        roiPerDay,
        totalRoi: (bid / strike) * 100,
        lowerBound,
        emSource: 'options',
        openInterest: put.openInterest,
        volume: put.volume,
        impliedVolatility: put.impliedVolatility,
      });
    }
  }

  return { qualifiedPuts, totalPutsChecked, datesScanned, rejectionStats };
}

function calcLowerBound(
  expStr: string,
  dte: number,
  currentPrice: number,
  expectedMoves: any[],
): number {
  for (const em of expectedMoves) {
    if (em?.expiration === expStr) return em?.lowerBound ?? 0;
  }
  if (expectedMoves.length > 0) {
    let closest: any = null;
    let minDiff = Infinity;
    for (const em of expectedMoves) {
      const diff = Math.abs((em?.dte ?? 0) - dte);
      if (diff < minDiff) { minDiff = diff; closest = em; }
    }
    if (closest) {
      const closestDte = closest?.dte ?? 1;
      const scaleFactor = Math.sqrt(dte / Math.max(closestDte, 1));
      const scaledMove = (closest?.expectedMove ?? 0) * scaleFactor;
      return currentPrice - scaledMove;
    }
  }
  return 0;
}

/**
 * Dual-EM lower bound: if TimesFM model's p10 is BELOW the options-implied
 * lower bound, the model sees more downside risk. Use the more conservative
 * bound to protect against underpriced risk.
 */
function calcModelAwareLowerBound(
  optionsLowerBound: number,
  timesfmEm: any | null,
  currentPrice: number,
): { bound: number; tightened: boolean } {
  if (!timesfmEm?.p10) return { bound: optionsLowerBound, tightened: false };
  // Model p10 as fraction of current price → scale to options context
  const modelPctBelow = (currentPrice - timesfmEm.p10) / currentPrice;
  const modelLowerBound = currentPrice * (1 - modelPctBelow);
  // Only tighten if model is more conservative (lower bound is lower)
  if (modelLowerBound < optionsLowerBound) {
    return { bound: modelLowerBound, tightened: true };
  }
  return { bound: optionsLowerBound, tightened: false };
}

// ── TimesFM probability scoring ─────────────────────────────────────

const QUANTILE_LEVELS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

/**
 * Interpolate the CDF: given a price, find P(price ≤ targetPrice) using
 * the model's quantile distribution at a specific DTE.
 */
function interpolateProb(
  targetPrice: number,
  quantileValues: number[],
): number {
  if (quantileValues.length < 2) return 0.5;

  // Below p10 — extrapolate
  if (targetPrice <= quantileValues[0]) {
    const step = quantileValues[1] - quantileValues[0];
    if (step > 0) {
      const extraSteps = (quantileValues[0] - targetPrice) / step;
      return Math.max(0.01, QUANTILE_LEVELS[0] - extraSteps * 0.025);
    }
    return 0.01;
  }
  // Above p90 — extrapolate
  if (targetPrice >= quantileValues[quantileValues.length - 1]) {
    const step = quantileValues[quantileValues.length - 1] - quantileValues[quantileValues.length - 2];
    if (step > 0) {
      const extraSteps = (targetPrice - quantileValues[quantileValues.length - 1]) / step;
      return Math.min(0.99, QUANTILE_LEVELS[QUANTILE_LEVELS.length - 1] + extraSteps * 0.025);
    }
    return 0.99;
  }
  // Linear interpolation between bracketing quantiles
  for (let i = 0; i < quantileValues.length - 1; i++) {
    if (targetPrice >= quantileValues[i] && targetPrice <= quantileValues[i + 1]) {
      const t = (targetPrice - quantileValues[i]) / (quantileValues[i + 1] - quantileValues[i]);
      return QUANTILE_LEVELS[i] + t * (QUANTILE_LEVELS[i + 1] - QUANTILE_LEVELS[i]);
    }
  }
  return 0.5;
}

/**
 * Score a qualified put using the model's quantile distribution at its DTE.
 * Returns P(assignment), P(profit), risk-adjusted ROI, and an overall score.
 */
function scorePutWithModel(
  put: { strike: number; bid: number; dte: number; roiPerDay: number; currentPrice?: number },
  term: any,
): {
  pAssignment: number;
  pProfit: number;
  riskAdjustedRoi: number;
  modelScore: number;
  breakeven: number;
} | null {
  if (!term?.p10 || !term?.p90 || !term?.horizons) return null;

  // Clamp DTE to model's max horizon
  const dteIdx = Math.min(put.dte, term.maxHorizon) - 1;
  if (dteIdx < 0 || dteIdx >= term.p10.length) return null;

  // Quantile values at this DTE
  const qVals = [
    term.p10[dteIdx], term.p20[dteIdx], term.p30[dteIdx], term.p40[dteIdx],
    term.p50[dteIdx], term.p60[dteIdx], term.p70[dteIdx], term.p80[dteIdx],
    term.p90[dteIdx],
  ];

  const { strike, bid } = put;

  // P(assignment) = P(price < strike at expiry)
  const pAssignment = interpolateProb(strike, qVals);

  // P(profit) = P(price > breakeven) where breakeven = strike - premium
  const breakeven = strike - bid;
  const pBelowBreakeven = interpolateProb(breakeven, qVals);
  const pProfit = 1 - pBelowBreakeven;

  // Risk-adjusted ROI/day: raw ROI/day × probability of keeping the premium
  const riskAdjustedRoi = put.roiPerDay * pProfit;

  // Overall model score: risk-adjusted ROI penalized by assignment probability
  // Higher score = better trade. Range: roughly 0 to 0.15
  const modelScore = riskAdjustedRoi * (1 - pAssignment);

  return {
    pAssignment,
    pProfit,
    riskAdjustedRoi,
    modelScore,
    breakeven,
  };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  // Anonymous users can access options IF they still have lookups remaining
  // (the analyze route already enforced the rate limit — this is step 2 of the same lookup)
  if (!session?.user) {
    const { checkAnonymousAccess, getClientIdentifier } = await import('@/lib/subscription');
    const identifier = getClientIdentifier(req);
    const access = await checkAnonymousAccess(identifier);
    if (!access.allowed) {
      return NextResponse.json({
        error: 'RATE_LIMITED',
        message: `You've used all ${access.totalAllowed} free lookups. Sign up for unlimited access.`,
        quarantinedUntil: access.quarantinedUntil,
        remaining: 0,
      }, { status: 403 });
    }
  }

  try {
    const body = await req.json();
    const ticker = (body?.ticker ?? '').toUpperCase().trim();
    const expectedMoves = body?.expectedMoves ?? [];
    const earningsDate = body?.earningsDate ?? null;
    const currentPrice = body?.currentPrice ?? 0;
    const timesfmEm = body?.timesfmEm ?? null;
    const timesfmTerm = body?.timesfmTerm ?? null;

    if (!ticker) {
      return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
    }

    const now = new Date();
    const earningsDateObj = earningsDate ? new Date(earningsDate) : null;

    console.log(`[OPTIONS] Scanning ${ticker} | Price: $${currentPrice} | Earnings: ${earningsDate ?? 'N/A'}`);

    let dataSource: DataSource = 'yahoo';
    let qualifiedPuts: any[] = [];
    let totalPutsChecked = 0;
    let datesScanned = 0;
    let rejectionStats = { lowStrike: 0, noBid: 0, lowRoi: 0, aboveLowerBound: 0 };
    let scanReason: string | undefined;

    try {
      console.log('[OPTIONS] Trying Yahoo Finance...');
      const allDates = await yahooGetExpirationDates(ticker);
      console.log(`[OPTIONS/YAHOO] Found ${allDates.length} expiration dates`);

      const validDates = (earningsDateObj && earningsDateObj > now)
        ? allDates.filter((d) => d < earningsDateObj)
        : allDates;

      if (validDates.length === 0) {
        throw new Error('No valid expiration dates found via Yahoo');
      }

      for (const expDate of validDates) {
        try {
          if (datesScanned > 0) await delay(300);

          const puts = await yahooGetPutsForDate(ticker, expDate);
          const dte = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (dte <= 0) continue;

          datesScanned++;
          const expStr = expDate.toISOString().split('T')[0];
          const lowerBound = calcLowerBound(expStr, dte, currentPrice, expectedMoves);

          console.log(`[OPTIONS/YAHOO] ${expStr} DTE:${dte} LB:$${lowerBound.toFixed(2)} Puts:${puts.length}`);

          for (const put of puts) {
            const strike = put?.strike ?? 0;
            const bid = put?.bid ?? 0;
            if (strike <= 0 || dte <= 0) continue;
            totalPutsChecked++;

            if (strike < currentPrice * 0.5) { rejectionStats.lowStrike++; continue; }
            if (bid <= 0) { rejectionStats.noBid++; continue; }

            const roiPerDay = (bid / strike / dte) * 100;
            if (roiPerDay <= 0.09) { rejectionStats.lowRoi++; continue; }
            if (strike > lowerBound) { rejectionStats.aboveLowerBound++; continue; }

            qualifiedPuts.push({
              strike,
              expiration: expStr,
              dte,
              premium: bid,
              bid,
              ask: put?.ask ?? 0,
              lastPrice: put?.lastPrice ?? 0,
              roiPerDay,
              totalRoi: (bid / strike) * 100,
              lowerBound,
              emSource: 'options',
              openInterest: put?.openInterest ?? 0,
              volume: put?.volume ?? 0,
              impliedVolatility: put?.impliedVolatility ?? 0,
            });
          }
        } catch (dateErr: any) {
          const msg = dateErr?.message ?? '';
          if (msg.includes('429') || msg.includes('Too Many Requests')) {
            console.warn('[OPTIONS/YAHOO] Rate limited mid-scan, falling back to Alpaca');
            throw dateErr;
          }
          console.error(`[OPTIONS/YAHOO] Error for ${expDate}:`, msg);
        }
      }

      console.log(`[OPTIONS/YAHOO] Complete: ${datesScanned} dates, ${totalPutsChecked} puts, ${qualifiedPuts.length} qualified`);
    } catch (yahooErr: any) {
      const msg = yahooErr?.message ?? '';
      console.warn(`[OPTIONS] Yahoo Finance failed: ${msg}`);

      if (isAlpacaConfigured()) {
        try {
          dataSource = 'alpaca';
          const result = await alpacaScanPuts(ticker, currentPrice, earningsDateObj, expectedMoves, timesfmEm);
          qualifiedPuts = result.qualifiedPuts;
          totalPutsChecked = result.totalPutsChecked;
          datesScanned = result.datesScanned;
          rejectionStats = result.rejectionStats;
          console.log(`[OPTIONS/ALPACA] Complete: ${datesScanned} dates, ${totalPutsChecked} puts, ${qualifiedPuts.length} qualified`);
        } catch (alpacaErr: any) {
          console.error('[OPTIONS/ALPACA] Also failed:', alpacaErr?.message);
          return NextResponse.json(
            { error: 'Both Yahoo Finance and Alpaca failed to retrieve options data. Please try again in a few minutes.' },
            { status: 503 }
          );
        }
      } else {
        if (msg.includes('429')) {
          scanReason = 'Yahoo Finance rate limit reached. Configure Alpaca API for automatic failover.';
        }
        if (datesScanned === 0) {
          return NextResponse.json(
            { error: 'Could not fetch options data. Yahoo Finance may be temporarily unavailable.' },
            { status: 503 }
          );
        }
      }
    }

    // ── TimesFM probability scoring ────────────────────────────────
    const modelPicks: any[] = [];

    if (timesfmTerm && qualifiedPuts.length > 0) {
      for (const put of qualifiedPuts) {
        const score = scorePutWithModel(put, timesfmTerm);
        if (score) {
          put.pAssignment = score.pAssignment;
          put.pProfit = score.pProfit;
          put.riskAdjustedRoi = score.riskAdjustedRoi;
          put.modelScore = score.modelScore;
          put.breakeven = score.breakeven;
          modelPicks.push(put);
        }
      }
      // Sort picks by model score (best first)
      modelPicks.sort((a, b) => (b.modelScore ?? 0) - (a.modelScore ?? 0));
      console.log(`[OPTIONS] Model scoring: ${modelPicks.length} puts scored`);
    }

    qualifiedPuts.sort((a: any, b: any) => (b?.roiPerDay ?? 0) - (a?.roiPerDay ?? 0));

    console.log(`[OPTIONS] Final: source=${dataSource}, ${qualifiedPuts.length} qualified puts`);

    return NextResponse.json({
      ticker,
      qualifiedPuts: qualifiedPuts.slice(0, 50),
      totalFound: qualifiedPuts.length,
      dataSource,
      modelPicks: modelPicks.slice(0, 5),
      hasModelScoring: modelPicks.length > 0,
      scanStats: {
        datesScanned,
        totalPutsChecked,
        rejections: rejectionStats,
        ...(scanReason ? { reason: scanReason } : {}),
      },
    });
  } catch (error: any) {
    console.error('[OPTIONS] Analysis error:', error);
    return NextResponse.json({ error: 'Failed to analyze options' }, { status: 500 });
  }
}
