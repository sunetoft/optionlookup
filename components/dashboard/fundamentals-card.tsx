'use client';

import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatMarketCap, formatNumber } from '@/lib/stock-utils';

interface FundamentalsData {
  pe: number | null;
  ps: number | null;
  epsGrowth: number | null;
  marketCap: number | null;
  name: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  dataSource: string;
}

export function FundamentalsCard({ data }: { data: FundamentalsData | null }) {
  if (!data) return null;
  const isPositive = data.change >= 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-display text-xl tracking-tight">{data.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-2xl font-bold">${formatNumber(data.currentPrice)}</span>
              <span className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {isPositive ? '+' : ''}{formatNumber(data.change)} ({isPositive ? '+' : ''}{formatNumber(data.changePercent)}%)
              </span>
            </div>
          </div>
          {data.dataSource && (
            <Badge variant="outline" className="text-xs font-mono">
              via {data.dataSource === 'alpaca' ? 'Alpaca' : 'Yahoo Finance'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="P/E Ratio" value={data.pe !== null ? formatNumber(data.pe) : 'N/A'} />
          <Metric label="P/S Ratio" value={data.ps !== null ? formatNumber(data.ps) : 'N/A'} />
          <Metric label="EPS Growth" value={data.epsGrowth !== null ? `${formatNumber(data.epsGrowth * 100)}%` : 'N/A'} />
          <Metric label="Market Cap" value={formatMarketCap(data.marketCap)} />
          <Metric label="Volume" value={data.volume ? data.volume.toLocaleString() : 'N/A'} />
          <Metric label="52W High" value={`$${formatNumber(data.fiftyTwoWeekHigh)}`} />
          <Metric label="52W Low" value={`$${formatNumber(data.fiftyTwoWeekLow)}`} />
          <Metric label="Prev Close" value={`$${formatNumber(data.previousClose)}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-mono font-semibold">{value}</p>
    </div>
  );
}
