/**
 * CSP Scanner Engine — reusable scanning logic for the multi-tenant scanner.
 *
 * Extracted from app/api/stock/options/route.ts with key differences:
 * - Strike filter: strike ≤ user price target (not EM lower bound)
 * - ROI threshold: 0.1%/day
 * - DTE: loose (no hard cutoff, badges outside 30-60 range)
 * - EM: calculated but used as WARNING indicator only, not a filter
 * - Earnings: warning flag if contract expires after next earnings date
 */

import {
  isAlpacaConfigured,
  fetchAlpacaExpirationDates,
  fetchAlpacaPutOptions,
  fetchAlpacaATMStraddle,
  AlpacaOptionContract,
} from '@/lib/alpaca-client';

// ── Types ────────────────────────────────────────────────────────────

export interface ScannerContract {
  strike: number;
  expiration: string;
  dte: number;
  bid: number;
  ask: number;
  roiPerDay: number;
  totalRoi: number;
  openInterest: number;
  volume: number;
  impliedVol: number;
  earningsWarning: boolean;
  emWarning: boolean;
  dteInRange: boolean;  // 30-60 DTE sweet spot
}

export interface ScannerResult {
  ticker: string;
  priceTarget: number;
  currentPrice: number;
  earningsDate: string | null;
  earningsDaysAway: number | null;
  contracts: ScannerContract[];
  bestContract: ScannerContract | null;
  stats: {
    datesScanned: number;
    totalPutsChecked: number;
    rejections: { noBid: number; aboveTarget: number; lowRoi: number; lowStrike: number };
  };
  error?: string;
}

// ── Yahoo helpers ────────────────────────────────────────────────────

async function getYF() {
  const YahooFinance = (await import('yahoo-finance2')).default;
  return new (YahooFinance as any)({ suppressNotices: ['yahooSurvey'] });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Constants ────────────────────────────────────────────────────────

const ROI_THRESHOLD = 0.1;  // 0.1% per trading day
const DTE_MIN = 30;
const DTE_MAX = 60;
const MAX_STRIKE_DEPTH = 0.5;  // don't look below 50% of current price

// ── Core scan function ───────────────────────────────────────────────

export async function scanTickerForCSP(
  ticker: string,
  priceTarget: number,
): Promise<ScannerResult> {
  const upperTicker = ticker.toUpperCase().trim();
  console.log(`[SCANNER] Scanning ${upperTicker} | Target: $${priceTarget}`);

  const emptyResult: ScannerResult = {
    ticker: upperTicker,
    priceTarget,
    currentPrice: 0,
    earningsDate: null,
    earningsDaysAway: null,
    contracts: [],
    bestContract: null,
    stats: { datesScanned: 0, totalPutsChecked: 0, rejections: { noBid: 0, aboveTarget: 0, lowRoi: 0, lowStrike: 0 } },
  };

  // Step 1: Get current price + earnings date from Yahoo
  let currentPrice = 0;
  let earningsDate: string | null = null;
  let earningsDaysAway: number | null = null;

  try {
    const yf = await getYF();
    const quote: any = await yf.quote(upperTicker);

    currentPrice = quote?.regularMarketPrice ?? quote?.regularMarketPreviousClose ?? 0;
    if (!currentPrice || currentPrice <= 0) {
      return { ...emptyResult, error: 'Could not fetch current price' };
    }

    const earningsTimestamp = quote?.earningsTimestamp;
    if (earningsTimestamp) {
      const ed = earningsTimestamp instanceof Date ? earningsTimestamp : new Date(earningsTimestamp);
      if (!isNaN(ed.getTime()) && ed.getFullYear() > 2020 && ed.getFullYear() < 2100 && ed > new Date()) {
        earningsDate = ed.toISOString().split('T')[0];
        earningsDaysAway = Math.ceil((ed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      }
    }

    console.log(`[SCANNER] ${upperTicker} | Price: $${currentPrice} | Earnings: ${earningsDate ?? 'N/A'}`);
  } catch (err: any) {
    console.error(`[SCANNER] Yahoo quote failed for ${upperTicker}:`, err?.message);
    return { ...emptyResult, error: `Failed to fetch quote: ${err?.message}` };
  }

  // Step 2: Scan option chains (Yahoo primary, Alpaca failover)
  let scanData: { contracts: ScannerContract[]; stats: { datesScanned: number; totalPutsChecked: number; rejections: { noBid: number; aboveTarget: number; lowRoi: number; lowStrike: number } } };

  try {
    scanData = await scanViaYahoo(upperTicker, currentPrice, priceTarget, earningsDate);
  } catch (yahooErr: any) {
    console.warn(`[SCANNER] Yahoo scan failed for ${upperTicker}: ${yahooErr?.message}`);
    if (isAlpacaConfigured()) {
      try {
        scanData = await scanViaAlpaca(upperTicker, currentPrice, priceTarget, earningsDate);
      } catch (alpacaErr: any) {
        console.error(`[SCANNER] Alpaca also failed for ${upperTicker}: ${alpacaErr?.message}`);
        return { ...emptyResult, currentPrice, earningsDate, earningsDaysAway, error: 'Both Yahoo and Alpaca failed' };
      }
    } else {
      return { ...emptyResult, currentPrice, earningsDate, earningsDaysAway, error: `Yahoo scan failed: ${yahooErr?.message}` };
    }
  }

  const contracts = scanData.contracts;
  contracts.sort((a, b) => b.roiPerDay - a.roiPerDay);
  const bestContract = contracts.length > 0 ? contracts[0] : null;

  console.log(`[SCANNER] ${upperTicker} done: ${contracts.length} qualifying contracts`);

  return {
    ticker: upperTicker,
    priceTarget,
    currentPrice,
    earningsDate,
    earningsDaysAway,
    contracts,
    bestContract,
    stats: scanData.stats,
  };
}

// ── Yahoo scan path ──────────────────────────────────────────────────

async function scanViaYahoo(
  ticker: string,
  currentPrice: number,
  priceTarget: number,
  earningsDate: string | null,
): Promise<{ contracts: ScannerContract[]; stats: { datesScanned: number; totalPutsChecked: number; rejections: { noBid: number; aboveTarget: number; lowRoi: number; lowStrike: number } } }> {
  const yf = await getYF();
  const now = new Date();

  const optData: any = await yf.options(ticker);
  const allDates: Date[] = (optData?.expirationDates ?? [])
    .map((d: any) => new Date(d))
    .filter((d: Date) => d > now)
    .sort((a: Date, b: Date) => a.getTime() - b.getTime());

  console.log(`[SCANNER/YAHOO] ${ticker}: ${allDates.length} expiration dates`);

  const futureEarnings = earningsDate ? new Date(earningsDate) : null;
  const futureEarningsValid = futureEarnings && futureEarnings > now ? futureEarnings : null;

  const contracts: ScannerContract[] = [];
  const rejections = { noBid: 0, aboveTarget: 0, lowRoi: 0, lowStrike: 0 };
  let totalPutsChecked = 0;
  let datesScanned = 0;

  for (const expDate of allDates) {
    try {
      if (datesScanned > 0) await delay(300);

      const putsData: any = await yf.options(ticker, { date: expDate });
      const puts = putsData?.options?.[0]?.puts ?? [];

      const dte = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (dte <= 0) continue;

      datesScanned++;
      const expStr = expDate.toISOString().split('T')[0];

      // EM calculation for this expiration (warning only, not a filter)
      const emLowerBound = await calcEMLowerBoundYahoo(yf, ticker, expStr, dte, currentPrice);

      // Earnings warning: contract expires after earnings
      const earningsWarning = futureEarningsValid
        ? new Date(expStr + 'T00:00:00Z') > futureEarningsValid
        : false;

      for (const put of puts) {
        const strike = put?.strike ?? 0;
        const bid = put?.bid ?? 0;
        if (strike <= 0 || dte <= 0) continue;
        totalPutsChecked++;

        if (strike < currentPrice * MAX_STRIKE_DEPTH) { rejections.lowStrike++; continue; }
        if (bid <= 0) { rejections.noBid++; continue; }
        if (strike > priceTarget) { rejections.aboveTarget++; continue; }

        const roiPerDay = (bid / strike / dte) * 100;
        if (roiPerDay < ROI_THRESHOLD) { rejections.lowRoi++; continue; }

        // EM warning: strike is inside the expected move range
        const emWarning = emLowerBound > 0 && strike > emLowerBound;

        // DTE range badge
        const dteInRange = dte >= DTE_MIN && dte <= DTE_MAX;

        contracts.push({
          strike,
          expiration: expStr,
          dte,
          bid,
          ask: put?.ask ?? 0,
          roiPerDay,
          totalRoi: (bid / strike) * 100,
          openInterest: put?.openInterest ?? 0,
          volume: put?.volume ?? 0,
          impliedVol: put?.impliedVolatility ?? 0,
          earningsWarning,
          emWarning,
          dteInRange,
        });
      }
    } catch (dateErr: any) {
      const msg = dateErr?.message ?? '';
      if (msg.includes('429') || msg.includes('Too Many Requests')) {
        throw dateErr;  // bubble up to trigger Alpaca failover
      }
      console.error(`[SCANNER/YAHOO] Error for ${ticker} ${expDate.toISOString().split('T')[0]}: ${msg}`);
    }
  }

  return {
    contracts,
    stats: { datesScanned, totalPutsChecked, rejections },
  };
}

/**
 * Calculate EM lower bound via ATM straddle (Yahoo options data).
 * Used for WARNING only — not as a strike filter.
 */
async function calcEMLowerBoundYahoo(
  yf: any,
  ticker: string,
  expStr: string,
  dte: number,
  currentPrice: number,
): Promise<number> {
  try {
    const optData: any = await yf.options(ticker, { date: new Date(expStr + 'T00:00:00Z') });
    const calls = optData?.options?.[0]?.calls ?? [];
    const puts = optData?.options?.[0]?.puts ?? [];

    // Find ATM call and put
    let atmCall = calls[0];
    let atmPut = puts[0];
    let minCallDiff = Infinity;
    let minPutDiff = Infinity;

    for (const c of calls) {
      const diff = Math.abs((c?.strike ?? 0) - currentPrice);
      if (diff < minCallDiff) { minCallDiff = diff; atmCall = c; }
    }
    for (const p of puts) {
      const diff = Math.abs((p?.strike ?? 0) - currentPrice);
      if (diff < minPutDiff) { minPutDiff = diff; atmPut = p; }
    }

    const callPrice = atmCall?.lastPrice ?? atmCall?.bid ?? 0;
    const putPrice = atmPut?.lastPrice ?? atmPut?.bid ?? 0;

    if (callPrice <= 0 && putPrice <= 0) return 0;

    const straddle = callPrice + putPrice;
    const expectedMove = straddle * 0.85;
    return currentPrice - expectedMove;
  } catch {
    return 0;
  }
}

// ── Alpaca scan path ─────────────────────────────────────────────────

async function scanViaAlpaca(
  ticker: string,
  currentPrice: number,
  priceTarget: number,
  earningsDate: string | null,
): Promise<{ contracts: ScannerContract[]; stats: { datesScanned: number; totalPutsChecked: number; rejections: { noBid: number; aboveTarget: number; lowRoi: number; lowStrike: number } } }> {
  console.log(`[SCANNER/ALPACA] Scanning ${ticker}`);
  const now = new Date();

  const allExpirations = await fetchAlpacaExpirationDates(ticker);
  console.log(`[SCANNER/ALPACA] ${ticker}: ${allExpirations.length} expiration dates`);

  const futureEarnings = earningsDate ? new Date(earningsDate) : null;
  const futureEarningsValid = futureEarnings && futureEarnings > now ? futureEarnings : null;

  const contracts: ScannerContract[] = [];
  const rejections = { noBid: 0, aboveTarget: 0, lowRoi: 0, lowStrike: 0 };
  let totalPutsChecked = 0;
  let datesScanned = 0;

  for (const expStr of allExpirations) {
    const expDate = new Date(expStr + 'T00:00:00Z');
    const dte = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (dte <= 0) continue;

    datesScanned++;

    // EM via Alpaca ATM straddle (warning only)
    let emLowerBound = 0;
    try {
      const straddle = await fetchAlpacaATMStraddle(ticker, currentPrice, expStr);
      if (straddle) {
        const expectedMove = (straddle.callPrice + straddle.putPrice) * 0.85;
        emLowerBound = currentPrice - expectedMove;
      }
    } catch {
      // non-fatal — EM is warning only
    }

    // Tight strike range: from deep OTM up to price target + small buffer
    const minStrike = Math.floor(currentPrice * MAX_STRIKE_DEPTH);
    const maxStrike = Math.ceil(Math.min(currentPrice, priceTarget) + 5);

    if (maxStrike < minStrike) continue;

    const putsForExp = await fetchAlpacaPutOptions(ticker, {
      expirationDateGte: expStr,
      expirationDateLte: expStr,
      strikePriceGte: minStrike,
      strikePriceLte: maxStrike,
      limit: 100,
    });

    console.log(`[SCANNER/ALPACA] ${ticker} ${expStr} DTE:${dte} Puts:${putsForExp.length}`);

    for (const put of putsForExp) {
      const { strike, bid } = put;
      totalPutsChecked++;

      if (strike < currentPrice * MAX_STRIKE_DEPTH) { rejections.lowStrike++; continue; }
      if (bid <= 0) { rejections.noBid++; continue; }
      if (strike > priceTarget) { rejections.aboveTarget++; continue; }

      const roiPerDay = (bid / strike / dte) * 100;
      if (roiPerDay < ROI_THRESHOLD) { rejections.lowRoi++; continue; }

      const earningsWarning = futureEarningsValid
        ? new Date(expStr + 'T00:00:00Z') > futureEarningsValid
        : false;

      const emWarning = emLowerBound > 0 && strike > emLowerBound;
      const dteInRange = dte >= DTE_MIN && dte <= DTE_MAX;

      contracts.push({
        strike,
        expiration: expStr,
        dte,
        bid,
        ask: put.ask,
        roiPerDay,
        totalRoi: (bid / strike) * 100,
        openInterest: put.openInterest,
        volume: put.volume,
        impliedVol: put.impliedVolatility,
        earningsWarning,
        emWarning,
        dteInRange,
      });
    }
  }

  return {
    contracts,
    stats: { datesScanned, totalPutsChecked, rejections },
  };
}
