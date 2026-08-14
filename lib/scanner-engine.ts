/**
 * Wheel Scanner Engine — reusable scanning logic for the multi-tenant scanner.
 *
 * Scans BOTH strategies in a single pass per ticker:
 *  - CSP (put, "PUT"):  strike ≤ user price target, ROI bid/strike/dte, DTE ~30-60 (loose ±2)
 *  - CC  (call, "CALL"): OTM calls above current price, ROI bid/currentPrice/dte, DTE ≤ 90, min 7
 *
 * Yahoo returns puts+calls in one call per expiration, so both strategies come
 * from the same API requests (no redundant round-trips).
 *
 * Strikes:
 *  - PUT:  strike ≤ price target, not below 50% of current price
 *  - CALL: OTM calls above current price, up to 50% OTM (price cap)
 *
 * Warnings:
 *  - Earnings: contract DTE extends past next earnings date (hard requirement)
 *  - EM (put):  strike is inside the expected move (above EM lower bound)
 *  - EM (call): strike is inside the expected move (below EM upper bound)
 */

import {
  isAlpacaConfigured,
  fetchAlpacaExpirationDates,
  fetchAlpacaPutOptions,
  fetchAlpacaCallOptions,
  fetchAlpacaATMStraddle,
  fetchAlpacaLatestPrice,
} from '@/lib/alpaca-client';

// ── Types ────────────────────────────────────────────────────────────

export type OptionType = 'PUT' | 'CALL';

export interface ScannerContract {
  optionType: OptionType;
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
  putContracts: ScannerContract[];
  callContracts: ScannerContract[];
  contracts: ScannerContract[];  // combined (put + call)
  bestContract: ScannerContract | null;
  bestPut: ScannerContract | null;
  bestCall: ScannerContract | null;
  stats: {
    datesScanned: number;
    totalPutsChecked: number;
    totalCallsChecked: number;
    rejections: { noBid: number; aboveTarget: number; lowRoi: number; lowStrike: number; itmCall: number };
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

// CSP puts (strike = collateral)
const PUT_DTE_MIN = 28;   // loose: 30-2 (per user's "loose = ±2" definition)
const PUT_DTE_MAX = 62;   // loose: 60+2

// Covered calls (share price = collateral)
const CALL_DTE_MIN = 7;   // avoid 0-DTE / same-week expiry noise
const CALL_DTE_MAX = 90;  // user hard requirement: max DTE 90

const DTE_SWEET_MIN = 30;  // for badge display only
const DTE_SWEET_MAX = 60;  // for badge display only

const MAX_STRIKE_DEPTH = 0.5;  // don't look below 50% of current price (puts)
const MAX_CALL_OTM = 1.5;      // don't look above 150% of current price (calls)

// ── Core scan function ───────────────────────────────────────────────

export async function scanTicker(
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
    putContracts: [],
    callContracts: [],
    contracts: [],
    bestContract: null,
    bestPut: null,
    bestCall: null,
    stats: { datesScanned: 0, totalPutsChecked: 0, totalCallsChecked: 0, rejections: { noBid: 0, aboveTarget: 0, lowRoi: 0, lowStrike: 0, itmCall: 0 } },
  };

  // Step 1: Get current price + earnings date from Yahoo
  let currentPrice = 0;
  let earningsDate: string | null = null;
  let earningsDaysAway: number | null = null;
  let yahooFailed = false;  // if Yahoo quote fails, skip Yahoo options scan too

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
    yahooFailed = true;
    // Alpaca fallback for price quote (Yahoo frequently returns 429)
    if (isAlpacaConfigured()) {
      try {
        const alpacaPrice = await fetchAlpacaLatestPrice(upperTicker);
        if (alpacaPrice > 0) {
          currentPrice = alpacaPrice;
          console.log(`[SCANNER] ${upperTicker} | Price: $${currentPrice} (via Alpaca fallback) | Earnings: N/A`);
        } else {
          return { ...emptyResult, error: `Both Yahoo and Alpaca failed to fetch price: ${err?.message}` };
        }
      } catch (alpacaErr: any) {
        return { ...emptyResult, error: `Yahoo quote failed: ${err?.message}; Alpaca fallback also failed: ${alpacaErr?.message}` };
      }
    } else {
      return { ...emptyResult, error: `Failed to fetch quote: ${err?.message}` };
    }
  }

  // Step 2: Scan option chains (Yahoo primary, Alpaca failover)
  let scanData: ReturnType<typeof emptyScanData>;

  if (yahooFailed && isAlpacaConfigured()) {
    try {
      scanData = await scanViaAlpaca(upperTicker, currentPrice, priceTarget, earningsDate);
    } catch (alpacaErr: any) {
      console.error(`[SCANNER] Alpaca also failed for ${upperTicker}: ${alpacaErr?.message}`);
      return { ...emptyResult, currentPrice, earningsDate, earningsDaysAway, error: 'Both Yahoo and Alpaca failed' };
    }
  } else {
    try {
      scanData = await scanViaYahoo(upperTicker, currentPrice, priceTarget, earningsDate);

      // Smart failover: if Yahoo returned 0 contracts but many were rejected for
      // "noBid", the data is likely stale — retry via Alpaca
      if (scanData.contracts.length === 0 && scanData.stats.rejections.noBid > 10 && isAlpacaConfigured()) {
        console.log(`[SCANNER] ${upperTicker}: Yahoo returned 0 contracts (${scanData.stats.rejections.noBid} noBid rejections) — retrying via Alpaca`);
        try {
          const alpacaData = await scanViaAlpaca(upperTicker, currentPrice, priceTarget, earningsDate);
          if (alpacaData.contracts.length > 0 || alpacaData.stats.totalPutsChecked + alpacaData.stats.totalCallsChecked > 0) {
            scanData = alpacaData;
          }
        } catch (alpacaErr: any) {
          console.warn(`[SCANNER] ${upperTicker}: Alpaca failover failed: ${alpacaErr?.message}`);
        }
      }
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
  }

  const putContracts = scanData.putContracts;
  const callContracts = scanData.callContracts;
  const contracts = [...putContracts, ...callContracts];

  putContracts.sort((a, b) => b.roiPerDay - a.roiPerDay);
  callContracts.sort((a, b) => b.roiPerDay - a.roiPerDay);
  contracts.sort((a, b) => b.roiPerDay - a.roiPerDay);

  const bestPut = putContracts.length > 0 ? putContracts[0] : null;
  const bestCall = callContracts.length > 0 ? callContracts[0] : null;
  const bestContract = contracts.length > 0 ? contracts[0] : null;

  console.log(`[SCANNER] ${upperTicker} done: ${putContracts.length} puts + ${callContracts.length} calls` +
    ` | rejections: noBid=${scanData.stats.rejections.noBid}, aboveTarget=${scanData.stats.rejections.aboveTarget}, lowRoi=${scanData.stats.rejections.lowRoi}, lowStrike=${scanData.stats.rejections.lowStrike}, itmCall=${scanData.stats.rejections.itmCall}` +
    ` | ${scanData.stats.totalPutsChecked} puts + ${scanData.stats.totalCallsChecked} calls checked across ${scanData.stats.datesScanned} dates`);

  return {
    ticker: upperTicker,
    priceTarget,
    currentPrice,
    earningsDate,
    earningsDaysAway,
    putContracts,
    callContracts,
    contracts,
    bestContract,
    bestPut,
    bestCall,
    stats: scanData.stats,
  };
}

// ── Shared empty stats ───────────────────────────────────────────────

function emptyScanData() {
  return {
    putContracts: [] as ScannerContract[],
    callContracts: [] as ScannerContract[],
    contracts: [] as ScannerContract[],
    stats: {
      datesScanned: 0,
      totalPutsChecked: 0,
      totalCallsChecked: 0,
      rejections: { noBid: 0, aboveTarget: 0, lowRoi: 0, lowStrike: 0, itmCall: 0 },
    },
  };
}

// ── Yahoo scan path ──────────────────────────────────────────────────

async function scanViaYahoo(
  ticker: string,
  currentPrice: number,
  priceTarget: number,
  earningsDate: string | null,
): Promise<ReturnType<typeof emptyScanData>> {
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

  const putContracts: ScannerContract[] = [];
  const callContracts: ScannerContract[] = [];
  const rejections = { noBid: 0, aboveTarget: 0, lowRoi: 0, lowStrike: 0, itmCall: 0 };
  let totalPutsChecked = 0;
  let totalCallsChecked = 0;
  let datesScanned = 0;

  for (const expDate of allDates) {
    try {
      if (datesScanned > 0) await delay(300);

      const dte = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Skip dates outside BOTH strategies' ranges (avoids useless API calls)
      const withinPutRange = dte >= PUT_DTE_MIN && dte <= PUT_DTE_MAX;
      const withinCallRange = dte >= CALL_DTE_MIN && dte <= CALL_DTE_MAX;
      if (!withinPutRange && !withinCallRange) continue;

      const chainData: any = await yf.options(ticker, { date: expDate });
      const puts = chainData?.options?.[0]?.puts ?? [];
      const calls = chainData?.options?.[0]?.calls ?? [];

      datesScanned++;
      const expStr = expDate.toISOString().split('T')[0];

      // EM bounds for this expiration (warnings only, not filters)
      const { emLowerBound, emUpperBound } = calcEMBounds(calls, puts, currentPrice);

      // Earnings warning: contract expires after earnings
      const earningsWarning = futureEarningsValid
        ? new Date(expStr + 'T00:00:00Z') > futureEarningsValid
        : false;

      // DTE range badge (sweet spot 30-60)
      const dteInRange = dte >= DTE_SWEET_MIN && dte <= DTE_SWEET_MAX;

      // ── CSP puts ──
      if (withinPutRange) {
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

          const emWarning = emLowerBound > 0 && strike > emLowerBound;

          putContracts.push({
            optionType: 'PUT',
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
      }

      // ── Covered calls ──
      if (withinCallRange) {
        for (const call of calls) {
          const strike = call?.strike ?? 0;
          const bid = call?.bid ?? 0;
          if (strike <= 0 || dte <= 0) continue;
          totalCallsChecked++;

          // CC must be OTM: strike above current price
          if (strike <= currentPrice) { rejections.itmCall++; continue; }
          if (strike > currentPrice * MAX_CALL_OTM) { rejections.lowStrike++; continue; }
          if (bid <= 0) { rejections.noBid++; continue; }

          // CC collateral = shares you own (current price)
          const roiPerDay = (bid / currentPrice / dte) * 100;
          if (roiPerDay < ROI_THRESHOLD) { rejections.lowRoi++; continue; }

          // EM warning: strike below EM upper bound → likely to be breached
          const emWarning = emUpperBound > 0 && strike < emUpperBound;

          callContracts.push({
            optionType: 'CALL',
            strike,
            expiration: expStr,
            dte,
            bid,
            ask: call?.ask ?? 0,
            roiPerDay,
            totalRoi: (bid / currentPrice) * 100,
            openInterest: call?.openInterest ?? 0,
            volume: call?.volume ?? 0,
            impliedVol: call?.impliedVolatility ?? 0,
            earningsWarning,
            emWarning,
            dteInRange: dte >= DTE_SWEET_MIN && dte <= DTE_SWEET_MAX,
          });
        }
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
    putContracts,
    callContracts,
    contracts: [...putContracts, ...callContracts],
    stats: { datesScanned, totalPutsChecked, totalCallsChecked, rejections },
  };
}

/**
 * Calculate EM bounds from pre-fetched ATM straddle data.
 * - emLowerBound = currentPrice - expectedMove  (put strike must be BELOW this)
 * - emUpperBound = currentPrice + expectedMove  (call strike must be ABOVE this)
 * Used for WARNING only — not a strike filter.
 */
function calcEMBounds(
  calls: any[],
  puts: any[],
  currentPrice: number,
): { emLowerBound: number; emUpperBound: number } {
  try {
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

    if (callPrice <= 0 && putPrice <= 0) return { emLowerBound: 0, emUpperBound: 0 };

    const straddle = callPrice + putPrice;
    const expectedMove = straddle * 0.85;
    return {
      emLowerBound: currentPrice - expectedMove,
      emUpperBound: currentPrice + expectedMove,
    };
  } catch {
    return { emLowerBound: 0, emUpperBound: 0 };
  }
}

// ── Alpaca scan path ─────────────────────────────────────────────────

async function scanViaAlpaca(
  ticker: string,
  currentPrice: number,
  priceTarget: number,
  earningsDate: string | null,
): Promise<ReturnType<typeof emptyScanData>> {
  console.log(`[SCANNER/ALPACA] Scanning ${ticker}`);
  const now = new Date();

  const putExpirations = await fetchAlpacaExpirationDates(ticker, 'put');
  const callExpirations = await fetchAlpacaExpirationDates(ticker, 'call');
  const allExpirations = [...new Set([...putExpirations, ...callExpirations])].sort();
  console.log(`[SCANNER/ALPACA] ${ticker}: ${allExpirations.length} expiration dates`);

  const futureEarnings = earningsDate ? new Date(earningsDate) : null;
  const futureEarningsValid = futureEarnings && futureEarnings > now ? futureEarnings : null;

  const putContracts: ScannerContract[] = [];
  const callContracts: ScannerContract[] = [];
  const rejections = { noBid: 0, aboveTarget: 0, lowRoi: 0, lowStrike: 0, itmCall: 0 };
  let totalPutsChecked = 0;
  let totalCallsChecked = 0;
  let datesScanned = 0;

  for (const expStr of allExpirations) {
    const expDate = new Date(expStr + 'T00:00:00Z');
    const dte = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const withinPutRange = dte >= PUT_DTE_MIN && dte <= PUT_DTE_MAX;
    const withinCallRange = dte >= CALL_DTE_MIN && dte <= CALL_DTE_MAX;
    if (!withinPutRange && !withinCallRange) continue;

    datesScanned++;

    // EM via Alpaca ATM straddle (warning only)
    let emLowerBound = 0;
    let emUpperBound = 0;
    try {
      const straddle = await fetchAlpacaATMStraddle(ticker, currentPrice, expStr);
      if (straddle) {
        const expectedMove = (straddle.callPrice + straddle.putPrice) * 0.85;
        emLowerBound = currentPrice - expectedMove;
        emUpperBound = currentPrice + expectedMove;
      }
    } catch {
      // non-fatal — EM is warning only
    }

    const earningsWarning = futureEarningsValid
      ? expDate > futureEarningsValid
      : false;

    // ── CSP puts ──
    if (withinPutRange) {
      const minStrike = Math.floor(currentPrice * MAX_STRIKE_DEPTH);
      const maxStrike = Math.ceil(Math.min(currentPrice, priceTarget) + 5);
      if (maxStrike >= minStrike) {
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

          const emWarning = emLowerBound > 0 && strike > emLowerBound;

          putContracts.push({
            optionType: 'PUT',
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
            dteInRange: dte >= DTE_SWEET_MIN && dte <= DTE_SWEET_MAX,
          });
        }
      }
    }

    // ── Covered calls ──
    if (withinCallRange) {
      const minStrike = Math.ceil(currentPrice + 0.01);
      const maxStrike = Math.ceil(currentPrice * MAX_CALL_OTM);
      if (maxStrike >= minStrike) {
        const callsForExp = await fetchAlpacaCallOptions(ticker, {
          expirationDateGte: expStr,
          expirationDateLte: expStr,
          strikePriceGte: minStrike,
          strikePriceLte: maxStrike,
          limit: 100,
        });

        console.log(`[SCANNER/ALPACA] ${ticker} ${expStr} DTE:${dte} Calls:${callsForExp.length}`);

        for (const call of callsForExp) {
          const { strike, bid } = call;
          totalCallsChecked++;

          if (strike <= currentPrice) { rejections.itmCall++; continue; }
          if (strike > currentPrice * MAX_CALL_OTM) { rejections.lowStrike++; continue; }
          if (bid <= 0) { rejections.noBid++; continue; }

          const roiPerDay = (bid / currentPrice / dte) * 100;
          if (roiPerDay < ROI_THRESHOLD) { rejections.lowRoi++; continue; }

          const emWarning = emUpperBound > 0 && strike < emUpperBound;

          callContracts.push({
            optionType: 'CALL',
            strike,
            expiration: expStr,
            dte,
            bid,
            ask: call.ask,
            roiPerDay,
            totalRoi: (bid / currentPrice) * 100,
            openInterest: call.openInterest,
            volume: call.volume,
            impliedVol: call.impliedVolatility,
            earningsWarning,
            emWarning,
            dteInRange: dte >= DTE_SWEET_MIN && dte <= DTE_SWEET_MAX,
          });
        }
      }
    }
  }

  return {
    putContracts,
    callContracts,
    contracts: [...putContracts, ...callContracts],
    stats: { datesScanned, totalPutsChecked, totalCallsChecked, rejections },
  };
}
