// Technical indicator calculations

export function calculateEMA(prices: number[], period: number): number[] {
  if (!prices?.length || prices.length < period) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [];
  
  // SMA for initial value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i] ?? 0;
  }
  ema.push(sum / period);
  
  for (let i = period; i < prices.length; i++) {
    const val = (prices[i] ?? 0) * k + (ema[ema.length - 1] ?? 0) * (1 - k);
    ema.push(val);
  }
  return ema;
}

export function calculateRSI(prices: number[], period: number = 14): number[] {
  if (!prices?.length || prices.length < period + 1) return [];
  const rsi: number[] = [];
  const changes: number[] = [];
  
  for (let i = 1; i < prices.length; i++) {
    changes.push((prices[i] ?? 0) - (prices[i - 1] ?? 0));
  }
  
  let avgGain = 0;
  let avgLoss = 0;
  
  for (let i = 0; i < period; i++) {
    const change = changes[i] ?? 0;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  
  avgGain /= period;
  avgLoss /= period;
  
  if (avgLoss === 0) rsi.push(100);
  else {
    const rs = avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }
  
  for (let i = period; i < changes.length; i++) {
    const change = changes[i] ?? 0;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    if (avgLoss === 0) rsi.push(100);
    else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }
  
  return rsi;
}

export function formatMarketCap(val: number | null | undefined): string {
  if (!val) return 'N/A';
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  return `$${val?.toFixed?.(2) ?? '0'}`;
}

export function formatNumber(val: number | null | undefined, decimals: number = 2): string {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  return val.toFixed(decimals);
}
