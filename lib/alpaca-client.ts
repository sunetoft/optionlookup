const ALPACA_DATA_URL = 'https://data.alpaca.markets';
const ALPACA_TRADING_URL = 'https://paper-api.alpaca.markets';

function getHeaders(): Record<string, string> {
  const key = process.env.ALPACA_API_KEY ?? '';
  const secret = process.env.ALPACA_API_SECRET ?? '';
  if (!key || !secret) {
    throw new Error('Alpaca API credentials not configured');
  }
  return {
    'APCA-API-KEY-ID': key,
    'APCA-API-SECRET-KEY': secret,
    'Accept': 'application/json',
  };
}

function parseOptionSymbol(sym: string): { underlying: string; expiration: string; type: string; strike: number } | null {
  const match = sym.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (!match) return null;
  const [, underlying, dateStr, type, strikeStr] = match;
  const year = 2000 + parseInt(dateStr.slice(0, 2));
  const month = dateStr.slice(2, 4);
  const day = dateStr.slice(4, 6);
  return {
    underlying,
    expiration: `${year}-${month}-${day}`,
    type: type === 'P' ? 'put' : 'call',
    strike: parseInt(strikeStr) / 1000,
  };
}

export interface AlpacaOptionContract {
  symbol: string;
  strike: number;
  expiration: string;
  bid: number;
  ask: number;
  lastPrice: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  type: 'put' | 'call';
}

export async function fetchAlpacaExpirationDates(ticker: string): Promise<string[]> {
  const headers = getHeaders();
  const today = new Date().toISOString().split('T')[0];
  const future = new Date();
  future.setMonth(future.getMonth() + 6);
  const futureStr = future.toISOString().split('T')[0];

  const expirations = new Set<string>();
  let pageToken: string | null = null;

  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      underlying_symbols: ticker,
      type: 'put',
      expiration_date_gte: today,
      expiration_date_lte: futureStr,
      status: 'active',
      limit: '100',
    });
    if (pageToken) params.set('page_token', pageToken);

    const url = `${ALPACA_TRADING_URL}/v2/options/contracts?${params.toString()}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`[ALPACA] Contracts fetch failed: ${res.status} ${res.statusText}`);
      break;
    }
    const data = await res.json();
    const contracts = data?.option_contracts ?? data ?? [];
    if (!Array.isArray(contracts) || contracts.length === 0) break;

    for (const c of contracts) {
      if (c?.expiration_date) expirations.add(c.expiration_date);
    }

    pageToken = data?.next_page_token ?? null;
    if (!pageToken) break;
  }

  return Array.from(expirations).sort();
}

export async function fetchAlpacaPutOptions(
  ticker: string,
  opts: {
    expirationDateGte?: string;
    expirationDateLte?: string;
    strikePriceGte?: number;
    strikePriceLte?: number;
    limit?: number;
  } = {}
): Promise<AlpacaOptionContract[]> {
  const headers = getHeaders();
  const allContracts: AlpacaOptionContract[] = [];
  let pageToken: string | null = null;
  const maxPages = 10;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      feed: 'indicative',
      type: 'put',
      limit: String(opts.limit ?? 100),
    });
    if (opts.expirationDateGte) params.set('expiration_date_gte', opts.expirationDateGte);
    if (opts.expirationDateLte) params.set('expiration_date_lte', opts.expirationDateLte);
    if (opts.strikePriceGte) params.set('strike_price_gte', String(opts.strikePriceGte));
    if (opts.strikePriceLte) params.set('strike_price_lte', String(opts.strikePriceLte));
    if (pageToken) params.set('page_token', pageToken);

    const url = `${ALPACA_DATA_URL}/v1beta1/options/snapshots/${ticker}?${params.toString()}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`[ALPACA] Snapshots fetch failed: ${res.status} ${res.statusText}`);
      break;
    }

    const data = await res.json();
    const snapshots = data?.snapshots ?? {};

    for (const [sym, snapshot] of Object.entries(snapshots)) {
      const parsed = parseOptionSymbol(sym);
      if (!parsed || parsed.type !== 'put') continue;

      const snap = snapshot as any;
      const quote = snap?.latestQuote ?? {};
      const trade = snap?.latestTrade ?? {};
      const greeks = snap?.greeks ?? {};

      allContracts.push({
        symbol: sym,
        strike: parsed.strike,
        expiration: parsed.expiration,
        bid: quote?.bp ?? 0,
        ask: quote?.ap ?? 0,
        lastPrice: trade?.p ?? 0,
        volume: trade?.s ?? 0,
        openInterest: snap?.openInterest ?? 0,
        impliedVolatility: greeks?.impliedVolatility ?? 0,
        type: 'put',
      });
    }

    pageToken = data?.next_page_token ?? null;
    if (!pageToken) break;
  }

  return allContracts;
}

export async function fetchAlpacaATMStraddle(
  ticker: string,
  currentPrice: number,
  expirationDate: string
): Promise<{ callPrice: number; putPrice: number; callStrike: number; putStrike: number } | null> {
  const headers = getHeaders();
  const strikeLow = Math.floor(currentPrice * 0.95);
  const strikeHigh = Math.ceil(currentPrice * 1.05);

  const results: { callPrice: number; putPrice: number; callStrike: number; putStrike: number } = {
    callPrice: 0, putPrice: 0, callStrike: 0, putStrike: 0,
  };

  for (const type of ['call', 'put'] as const) {
    const params = new URLSearchParams({
      feed: 'indicative',
      type,
      expiration_date: expirationDate,
      strike_price_gte: String(strikeLow),
      strike_price_lte: String(strikeHigh),
      limit: '50',
    });

    const url = `${ALPACA_DATA_URL}/v1beta1/options/snapshots/${ticker}?${params.toString()}`;
    const res = await fetch(url, { headers });
    if (!res.ok) continue;

    const data = await res.json();
    const snapshots = data?.snapshots ?? {};

    let closestDiff = Infinity;
    for (const [sym, snapshot] of Object.entries(snapshots)) {
      const parsed = parseOptionSymbol(sym);
      if (!parsed) continue;
      const diff = Math.abs(parsed.strike - currentPrice);
      if (diff < closestDiff) {
        closestDiff = diff;
        const snap = snapshot as any;
        const quote = snap?.latestQuote ?? {};
        const trade = snap?.latestTrade ?? {};
        const price = (quote?.bp ?? 0) > 0 ? quote.bp : (trade?.p ?? 0);
        if (type === 'call') {
          results.callPrice = price;
          results.callStrike = parsed.strike;
        } else {
          results.putPrice = price;
          results.putStrike = parsed.strike;
        }
      }
    }
  }

  if (results.callPrice === 0 && results.putPrice === 0) return null;
  return results;
}

export function isAlpacaConfigured(): boolean {
  return !!(process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET);
}
