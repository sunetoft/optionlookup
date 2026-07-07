'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Brain } from 'lucide-react';

interface PriceChartContentProps {
  priceHistory: any[];
  expectedMoves: any[];
  currentPrice: number;
  timesfmEm?: any | null;
}

// Distinct colors for up to 4 expected moves (2 weekly + 2 monthly)
const EM_COLORS = [
  'hsl(var(--chart-3))', // red/terracotta
  'hsl(var(--chart-4))', // deep blue
  'hsl(var(--chart-5))', // amber/gold
  'hsl(var(--chart-2))', // teal
];

const TIMESFM_COLOR = 'hsl(var(--chart-4))'; // deep blue

export function PriceChartContent({ priceHistory, expectedMoves, currentPrice, timesfmEm }: PriceChartContentProps) {
  const data = (priceHistory ?? []).map((d: any) => ({
    date: d?.date ?? '',
    close: d?.close ?? 0,
    ema21: d?.ema21 ?? null,
  }));

  const moves = (expectedMoves ?? []).filter(
    (m: any) => m?.upperBound != null && m?.lowerBound != null && m.upperBound > 0 && m.lowerBound > 0
  );

  const hasTimesfm = timesfmEm?.pointForecast != null && timesfmEm?.p10 != null && timesfmEm?.p90 != null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-lg tracking-tight flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-amber-500" />
          Price History (6 Months)
        </CardTitle>
        {/* Legend for expected move lines */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
          {moves.map((m: any, i: number) => {
            const color = EM_COLORS[i % EM_COLORS.length];
            const label = m?.type === 'weekly'
              ? `Wk ${m?.expiration?.slice(5)}`
              : `Mo ${m?.expiration?.slice(5)}`;
            return (
              <div key={`legend-${i}`} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-4 border-t-2 border-dotted"
                  style={{ borderColor: color }}
                />
                <span className="text-[11px] text-muted-foreground font-mono">
                  {label} <span className="text-foreground/60">±${Number(m?.expectedMove ?? 0).toFixed(2)}</span>
                </span>
              </div>
            );
          })}
          {hasTimesfm && (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-4 h-3 rounded-sm border"
                style={{ borderColor: TIMESFM_COLOR, backgroundColor: 'hsl(var(--chart-4) / 0.12)' }}
              />
              <span className="text-[11px] text-muted-foreground font-mono">
                TimesFM {timesfmEm.horizon}D{' '}
                <span className="text-foreground/60">
                  ${timesfmEm.p10.toFixed(0)}–${timesfmEm.p90.toFixed(0)}
                </span>
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickFormatter={(v) => v?.slice(5)}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                domain={['auto', 'auto']}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: any, name: any) => [`$${Number(value).toFixed(2)}`, name === 'close' ? 'Close' : 'EMA 21']}
              />

              {/* TimesFM quantile band (p10–p90 shaded area) */}
              {hasTimesfm && (
                <ReferenceArea
                  y1={timesfmEm.p10}
                  y2={timesfmEm.p90}
                  fill={TIMESFM_COLOR}
                  fillOpacity={0.08}
                  stroke={TIMESFM_COLOR}
                  strokeOpacity={0.2}
                  strokeDasharray="2 2"
                />
              )}

              {/* TimesFM point forecast line */}
              {hasTimesfm && (
                <ReferenceLine
                  y={timesfmEm.pointForecast}
                  stroke={TIMESFM_COLOR}
                  strokeDasharray="2 4"
                  strokeWidth={1.5}
                  label={{ value: 'Model FC', position: 'right', fontSize: 9, fill: TIMESFM_COLOR }}
                />
              )}

              {/* Current price line */}
              <ReferenceLine y={currentPrice} stroke="hsl(var(--primary))" strokeDasharray="5 5" label={{ value: 'Current', position: 'right', fontSize: 10, fill: 'hsl(var(--primary))' }} />

              {/* Expected move upper/lower bounds as dotted horizontal lines */}
              {moves.map((m: any, i: number) => {
                const color = EM_COLORS[i % EM_COLORS.length];
                const label = m?.type === 'weekly' ? `Wk` : `Mo`;
                return (
                  <ReferenceLine
                    key={`em-upper-${i}`}
                    y={m.upperBound}
                    stroke={color}
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    label={{ value: `${label} ↑`, position: 'right', fontSize: 9, fill: color }}
                  />
                );
              })}
              {moves.map((m: any, i: number) => {
                const color = EM_COLORS[i % EM_COLORS.length];
                const label = m?.type === 'weekly' ? `Wk` : `Mo`;
                return (
                  <ReferenceLine
                    key={`em-lower-${i}`}
                    y={m.lowerBound}
                    stroke={color}
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    label={{ value: `${label} ↓`, position: 'right', fontSize: 9, fill: color }}
                  />
                );
              })}

              <Line
                type="monotone"
                dataKey="close"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="ema21"
                stroke="hsl(var(--chart-2))"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
