'use client';

import dynamic from 'next/dynamic';

const PriceChartContent = dynamic(() => import('./price-chart-content').then(m => m.PriceChartContent), {
  ssr: false,
  loading: () => (
    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
      Loading chart...
    </div>
  ),
});

interface PriceChartProps {
  priceHistory: any[];
  expectedMoves: any[];
  currentPrice: number;
  timesfmEm?: any | null;
}

export function PriceChart(props: PriceChartProps) {
  return <PriceChartContent {...props} />;
}
