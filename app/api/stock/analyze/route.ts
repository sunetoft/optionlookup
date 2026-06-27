export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { calculateEMA, calculateRSI } from '@/lib/stock-utils';

import YahooFinance from 'yahoo-finance2';
import { isAlpacaConfigured, fetchAlpacaATMStraddle, fetchAlpacaExpirationDates } from '@/lib/alpaca-client';
import { hasActiveSubscription, checkAnonymousAccess, recordAnonymousLookup, getClientIdentifier } from '@/lib/subscription';

function getYF() {
  return new (YahooFinance as any)({ suppressNotices: ['yahooSurvey'] });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1500): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = err?.message ?? '';
      const is429 = msg.includes('429') || msg.includes('Too Many Requests');
      if (i < retries && is429) {
        console.warn(`[RETRY] Attempt ${i + 1} failed (429), waiting ${delayMs * (i + 1)}ms...`);
        await delay(delayMs * (i + 1));
      } else {
        throw err;
      }
    }
  }
  throw new Error('withRetry exhausted');
}

async function fetchYahooQuote(ticker: string): Promise<any> {
  try {
    return await withRetry(async () => {
      const yf = getYF();
      return await yf.quote(ticker);
    });
  } catch (err: any) {
    console.error('[ANALYZE] Quote fetch error:', err?.message);
    return null;
  }
}

async function fetchYahooHistory(ticker: string, months: number = 6): Promise<any> {
  try {
    return await withRetry(async () => {
      const yf = getYF();
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);
      return await yf.chart(ticker, {
        period1: startDate.toISOString().split('T')[0],
        period2: endDate.toISOString().split('T')[0],
        interval: '1d',
      });
    });
  } catch (err: any) {
    console.error('[ANALYZE] History fetch error:', err?.message);
    return null;
  }
}

async function fetchYahooOptions(ticker: string): Promise<any> {
  try {
    return await withRetry(async () => {
      const yf = getYF();
      return await yf.options(ticker);
    });
  } catch (err: any) {
    console.error('[ANALYZE] Options fetch error:', err?.message);
    return null;
  }
}

async function fetchAllOptionDates(ticker: string): Promise<any[]> {
  try {
    return await withRetry(async () => {
      const yf = getYF();
      const options: any = await yf.options(ticker);
      return options?.expirationDates ?? [];
    });
  } catch (err: any) {
    console.error('[ANALYZE] Option dates fetch error:', err?.message);
    return [];
  }
}

async function fetchOptionsForDate(ticker: string, date: Date): Promise<any> {
  try {
    return await withRetry(async () => {
      const yf = getYF();
      return await yf.options(ticker, { date });
    }, 1, 1000);
  } catch (err: any) {
    console.error('[ANALYZE] Options for date fetch error:', err?.message);
    return null;
  }
}

// Alpaca quote + history failover
const ALPACA_DATA_URL = 'https://data.alpaca.markets';

function getAlpacaHeaders(): Record<string, string> {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET ?? '',
    'Accept': 'application/json',
  };
}

async function fetchAlpacaSnapshot(ticker: string): Promise<any> {
  const headers = getAlpacaHeaders();
  const res = await fetch(`${ALPACA_DATA_URL}/v2/stocks/${ticker}/snapshot?feed=iex`, { headers });
  if (!res.ok) throw new Error(`Alpaca snapshot ${res.status}`);
  return await res.json();
}

// ── TimesFM sidecar ─────────────────────────────────────────────────
async function fetchTimesfmTerm(ticker: string, maxHorizon: number = 45): Promise<any> {
  try {
    const res = await fetch('http://127.0.0.1:3014/forecast_term', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, max_horizon: maxHorizon }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.warn(`[ANALYZE] TimesFM sidecar returned ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e: any) {
    console.warn('[ANALYZE] TimesFM sidecar error:', e?.message);
    return null; // Graceful degradation
  }
}

async function fetchAlpacaHistory(ticker: string, months: number = 6): Promise<Array<{ date: string; close: number }>> {
  const headers = getAlpacaHeaders();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  
  const allBars: Array<{ date: string; close: number }> = [];
  let pageToken: string | null = null;
  
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({
      timeframe: '1Day',
      start: startDate.toISOString().split('T')[0],
      limit: '1000',
      feed: 'iex',
    });
    if (pageToken) params.set('page_token', pageToken);
    
    const res = await fetch(`${ALPACA_DATA_URL}/v2/stocks/${ticker}/bars?${params}`, { headers });
    if (!res.ok) break;
    const data = await res.json();
    const bars = data?.bars ?? [];
    if (bars.length === 0) break;
    
    for (const b of bars) {
      allBars.push({ date: (b.t ?? '').slice(0, 10), close: b.c ?? 0 });
    }
    pageToken = data?.next_page_token ?? null;
    if (!pageToken) break;
  }
  return allBars;
}

export async function POST(req: NextRequest) {
  try {
    // ── Parse body first so we have ticker for rate limiting ──
    const body = await req.json();
    const ticker = (body?.ticker ?? '').toUpperCase().trim();

    if (!ticker || ticker.length > 10) {
      return NextResponse.json({ error: 'Invalid ticker symbol' }, { status: 400 });
    }

    // ── Rate limiting ──
    const session = await getServerSession(authOptions);
    const isAnonymous = !session?.user?.id;

    if (isAnonymous) {
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

      await recordAnonymousLookup(identifier, ticker);
    } else {
      // Authenticated user — check subscription
      const hasSub = await hasActiveSubscription(session.user.id);
      if (!hasSub) {
        const identifier = `user:${session.user.id}`;
        const access = await checkAnonymousAccess(identifier);

        if (!access.allowed) {
          return NextResponse.json({
            error: 'RATE_LIMITED',
            message: `You've used all ${access.totalAllowed} free lookups. Upgrade to unlimited.`,
            quarantinedUntil: access.quarantinedUntil,
            remaining: 0,
          }, { status: 403 });
        }

        await recordAnonymousLookup(identifier, ticker);
      }
    }

    // Fetch data in parallel
    const [quote, history, optionsData, allDates] = await Promise.all([
      fetchYahooQuote(ticker),
      fetchYahooHistory(ticker, 6),
      fetchYahooOptions(ticker),
      fetchAllOptionDates(ticker),
    ]);

    // Alpaca failover for quote
    let resolvedQuote = quote;
    let usedAlpacaForQuote = false;

    if (!resolvedQuote && isAlpacaConfigured()) {
      try {
        console.log(`[ANALYZE] Yahoo quote failed for ${ticker}, trying Alpaca snapshot...`);
        const snap = await fetchAlpacaSnapshot(ticker);
        if (snap?.latestTrade?.p) {
          const price = snap.latestTrade.p;
          const prevClose = snap.previousDailyBar?.c ?? price;
          resolvedQuote = {
            regularMarketPrice: price,
            regularMarketPreviousClose: prevClose,
            regularMarketChange: price - prevClose,
            regularMarketChangePercent: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
            regularMarketVolume: snap.dailyBar?.v ?? snap.minuteBar?.v ?? 0,
            shortName: ticker,
            fiftyTwoWeekHigh: 0,
            fiftyTwoWeekLow: 0,
            trailingPE: null,
            priceToSalesTrailing12Months: null,
            earningsQuarterlyGrowth: null,
            marketCap: null,
          };
          usedAlpacaForQuote = true;
          console.log(`[ANALYZE] Alpaca snapshot OK for ${ticker}, price=${price}`);
        }
      } catch (alpErr: any) {
        console.error(`[ANALYZE] Alpaca snapshot error for ${ticker}:`, alpErr?.message);
      }
    }

    if (!resolvedQuote) {
      return NextResponse.json({ error: `Could not find data for ticker: ${ticker}` }, { status: 404 });
    }

    const currentPrice = resolvedQuote?.regularMarketPrice ?? 0;

    // Extract fundamentals
    const fundamentals = {
      pe: (resolvedQuote as any)?.trailingPE ?? null,
      ps: (resolvedQuote as any)?.priceToSalesTrailing12Months ?? null,
      epsGrowth: (resolvedQuote as any)?.earningsQuarterlyGrowth ?? null,
      marketCap: (resolvedQuote as any)?.marketCap ?? null,
      name: (resolvedQuote as any)?.shortName ?? (resolvedQuote as any)?.longName ?? ticker,
      currentPrice,
      previousClose: (resolvedQuote as any)?.regularMarketPreviousClose ?? 0,
      change: (resolvedQuote as any)?.regularMarketChange ?? 0,
      changePercent: (resolvedQuote as any)?.regularMarketChangePercent ?? 0,
      volume: (resolvedQuote as any)?.regularMarketVolume ?? 0,
      fiftyTwoWeekHigh: (resolvedQuote as any)?.fiftyTwoWeekHigh ?? 0,
      fiftyTwoWeekLow: (resolvedQuote as any)?.fiftyTwoWeekLow ?? 0,
      dataSource: usedAlpacaForQuote ? 'alpaca' : 'yahoo',
    };

    // Alpaca failover for history
    let resolvedHistory = history;
    let usedAlpacaForHistory = false;

    if ((!resolvedHistory || !(resolvedHistory?.quotes?.length)) && isAlpacaConfigured()) {
      try {
        console.log(`[ANALYZE] Yahoo history failed for ${ticker}, trying Alpaca bars...`);
        const alpBars = await fetchAlpacaHistory(ticker, 6);
        if (alpBars.length > 0) {
          resolvedHistory = {
            quotes: alpBars.map(b => ({ date: b.date, close: b.close })),
          };
          usedAlpacaForHistory = true;
          console.log(`[ANALYZE] Alpaca history OK for ${ticker}, bars=${alpBars.length}`);
        }
      } catch (alpErr: any) {
        console.error(`[ANALYZE] Alpaca history error for ${ticker}:`, alpErr?.message);
      }
    }

    // Process historical data
    const quotes = resolvedHistory?.quotes ?? [];
    const closePrices = quotes?.map?.((q: any) => q?.close ?? 0)?.filter?.((p: number) => p > 0) ?? [];
    const dates = quotes?.map?.((q: any) => q?.date ? new Date(q.date).toISOString().split('T')[0] : '')?.filter?.((d: string) => d) ?? [];

    // Calculate EMA 21
    const ema21Values = calculateEMA(closePrices, 21);
    const currentEma21 = ema21Values?.length ? ema21Values[ema21Values.length - 1] ?? 0 : 0;
    const ema21Deviation = currentEma21 > 0 ? ((currentPrice - currentEma21) / currentEma21) * 100 : 0;

    // Calculate RSI 14
    const rsi14Values = calculateRSI(closePrices, 14);
    const currentRsi = rsi14Values?.length ? rsi14Values[rsi14Values.length - 1] ?? 0 : 0;

    // Monthly range (last 30 days)
    const last30Prices = closePrices.slice(-30);
    const monthlyHigh = last30Prices?.length ? Math.max(...last30Prices) : 0;
    const monthlyLow = last30Prices?.length ? Math.min(...last30Prices) : 0;
    const monthlyRange = monthlyHigh - monthlyLow;
    const priceInRange = monthlyRange > 0 ? ((currentPrice - monthlyLow) / monthlyRange) * 100 : 50;

    // Earnings date
    let earningsDate: string | null = null;
    let earningsDaysAway: number | null = null;
    const earningsTimestamp = (quote as any)?.earningsTimestamp;
    if (earningsTimestamp) {
      const ed = earningsTimestamp instanceof Date ? earningsTimestamp : new Date(earningsTimestamp);
      if (!isNaN(ed.getTime()) && ed.getFullYear() > 2020 && ed.getFullYear() < 2100) {
        earningsDate = ed.toISOString().split('T')[0];
        const now = new Date();
        earningsDaysAway = Math.ceil((ed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    // Technical warnings
    const warnings = {
      earnings: {
        value: earningsDaysAway,
        date: earningsDate,
        safe: earningsDaysAway === null || earningsDaysAway > 30,
        label: earningsDaysAway !== null ? `${earningsDaysAway} days away` : 'Unknown',
      },
      ema21: {
        value: ema21Deviation,
        ema: currentEma21,
        safe: ema21Deviation <= 5,
        label: `${ema21Deviation >= 0 ? '+' : ''}${ema21Deviation.toFixed(2)}% from 21 EMA`,
      },
      rsi: {
        value: currentRsi,
        safe: currentRsi <= 50,
        label: `RSI: ${currentRsi.toFixed(1)}`,
      },
      monthlyRange: {
        value: priceInRange,
        high: monthlyHigh,
        low: monthlyLow,
        safe: priceInRange <= 70,
        label: `${priceInRange.toFixed(1)}% of monthly range`,
      },
    };

    // Expected move calculation from ATM options
    const calls = optionsData?.options?.[0]?.calls ?? [];
    const puts = optionsData?.options?.[0]?.puts ?? [];

    const expectedMoves: any[] = [];
    
    const now = new Date();
    const sortedDates = (allDates ?? []).map((d: any) => new Date(d)).filter((d: Date) => d > now).sort((a: Date, b: Date) => a.getTime() - b.getTime());
    
    const weeklyDates = sortedDates.filter((d: Date) => {
      const dte = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return dte <= 14;
    }).slice(0, 2);

    const monthlyDates = sortedDates.filter((d: Date) => {
      const dte = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return dte > 14;
    }).slice(0, 2);

    const targetDates = [...weeklyDates, ...monthlyDates];

    const buildExpectedMove = (
      expStr: string,
      dte: number,
      straddle: number,
      atmCallStrike: number,
      atmPutStrike: number,
    ) => {
      const expectedMove = straddle * 0.85;
      return {
        expiration: expStr,
        dte,
        type: dte <= 14 ? 'weekly' : 'monthly',
        straddle,
        expectedMove,
        upperBound: currentPrice + expectedMove,
        lowerBound: currentPrice - expectedMove,
        atmCallStrike,
        atmPutStrike,
      };
    };

    let usedAlpacaForMoves = false;

    for (const expDate of targetDates) {
      const expStr = expDate.toISOString().split('T')[0];
      const dte = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (dte <= 0) continue;

      let gotData = false;

      try {
        const optData = await fetchOptionsForDate(ticker, expDate);
        const expCalls = optData?.options?.[0]?.calls ?? [];
        const expPuts = optData?.options?.[0]?.puts ?? [];

        if (expCalls.length > 0 || expPuts.length > 0) {
          let atmCall: any = null;
          let minCallDiff = Infinity;
          for (const c of expCalls) {
            const diff = Math.abs((c?.strike ?? 0) - currentPrice);
            if (diff < minCallDiff) { minCallDiff = diff; atmCall = c; }
          }
          let atmPut: any = null;
          let minPutDiff = Infinity;
          for (const p of expPuts) {
            const diff = Math.abs((p?.strike ?? 0) - currentPrice);
            if (diff < minPutDiff) { minPutDiff = diff; atmPut = p; }
          }

          const atmCallPrice = atmCall?.lastPrice ?? atmCall?.bid ?? 0;
          const atmPutPrice = atmPut?.lastPrice ?? atmPut?.bid ?? 0;
          const straddle = atmCallPrice + atmPutPrice;

          if (straddle > 0) {
            expectedMoves.push(buildExpectedMove(expStr, dte, straddle, atmCall?.strike ?? 0, atmPut?.strike ?? 0));
            gotData = true;
          }
        }
      } catch (e: any) {
        console.error(`[ANALYZE] Yahoo options error for ${expStr}:`, e?.message);
      }

      if (!gotData && isAlpacaConfigured()) {
        try {
          console.log(`[ANALYZE] Trying Alpaca for expected move on ${expStr}`);
          const straddle = await fetchAlpacaATMStraddle(ticker, currentPrice, expStr);
          if (straddle) {
            const straddleValue = straddle.callPrice + straddle.putPrice;
            if (straddleValue > 0) {
              expectedMoves.push(buildExpectedMove(expStr, dte, straddleValue, straddle.callStrike, straddle.putStrike));
              usedAlpacaForMoves = true;
              gotData = true;
            }
          }
        } catch (alpErr: any) {
          console.error(`[ANALYZE] Alpaca straddle error for ${expStr}:`, alpErr?.message);
        }
      }
    }

    // Build price history with EMA for chart
    const priceHistory = [];
    const emaOffset = closePrices.length - ema21Values.length;
    for (let i = 0; i < closePrices.length; i++) {
      priceHistory.push({
        date: dates[i] ?? '',
        close: closePrices[i] ?? 0,
        ema21: i >= emaOffset ? (ema21Values[i - emaOffset] ?? null) : null,
      });
    }

    // If Alpaca was used for quote, try to compute 52wk high/low from history
    if (usedAlpacaForQuote && closePrices.length > 0) {
      fundamentals.fiftyTwoWeekHigh = Math.max(...closePrices);
      fundamentals.fiftyTwoWeekLow = Math.min(...closePrices);
    }

    // ── TimesFM model-based EM + term structure (dual-EM validation) ──
    const nearestMonthlyDte = expectedMoves
      .filter((m: any) => m?.type === 'monthly')
      .sort((a: any, b: any) => a.dte - b.dte)[0]?.dte ?? 21;

    const timesfmRaw = await fetchTimesfmTerm(ticker, 45);

    let timesfmEm: any = null;
    let timesfmTerm: any = null;

    if (timesfmRaw && timesfmRaw.pointForecast) {
      // Extract summary for EM card (backward compat)
      const modelRangeWidth = timesfmRaw.modelRangeWidth;
      const modelEm = modelRangeWidth / 2;

      // Compare with nearest monthly options-implied EM
      const optionsMonthlyEm = expectedMoves
        .filter((m: any) => m?.type === 'monthly')
        .sort((a: any, b: any) => a.dte - b.dte)[0];

      let verdict = 'neutral';
      let verdictDetail = 'No options-implied EM to compare';

      if (optionsMonthlyEm) {
        const optionsEm = optionsMonthlyEm.expectedMove;
        const divergence = Math.abs(optionsEm - modelEm) / Math.max(optionsEm, modelEm);

        if (divergence < 0.10) {
          verdict = 'agreement';
          verdictDetail = `EMs agree within ${divergence.toFixed(0)}% — options pricing aligns with model`;
        } else if (modelEm > optionsEm) {
          verdict = 'model_wider';
          verdictDetail = `Model range is ${(divergence * 100).toFixed(0)}% wider — options may be underpricing risk`;
        } else {
          verdict = 'options_richer';
          verdictDetail = `Options EM is ${(divergence * 100).toFixed(0)}% wider — premium is rich (good for selling)`;
        }
      }

      timesfmEm = {
        pointForecast: timesfmRaw.pointForecast,
        p10: timesfmRaw.summaryP10,
        p50: timesfmRaw.summaryP50,
        p90: timesfmRaw.summaryP90,
        modelExpectedMove: modelEm,
        modelRangeWidth: modelRangeWidth,
        forecastReturn: timesfmRaw.forecastReturn,
        horizon: nearestMonthlyDte,
        contextPoints: timesfmRaw.contextPoints,
        verdict,
        verdictDetail,
      };

      // Full term structure for options scoring
      timesfmTerm = {
        currentPrice: timesfmRaw.currentPrice,
        maxHorizon: timesfmRaw.maxHorizon,
        horizons: timesfmRaw.horizons,
        point: timesfmRaw.point,
        p10: timesfmRaw.p10, p20: timesfmRaw.p20, p30: timesfmRaw.p30, p40: timesfmRaw.p40,
        p50: timesfmRaw.p50, p60: timesfmRaw.p60, p70: timesfmRaw.p70, p80: timesfmRaw.p80, p90: timesfmRaw.p90,
      };
    }

    return NextResponse.json({
      ticker,
      fundamentals,
      warnings,
      expectedMoves,
      priceHistory,
      earningsDate,
      earningsDaysAway,
      timesfmEm,
      timesfmTerm,
      dataSource: {
        quote: usedAlpacaForQuote ? 'alpaca' : 'yahoo',
        history: usedAlpacaForHistory ? 'alpaca' : 'yahoo',
        moves: usedAlpacaForMoves ? 'alpaca' : 'yahoo',
      },
    });
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: 'Failed to analyze stock. Please try again.' }, { status: 500 });
  }
}
