'use client';

import {
  Zap, TrendingUp, TrendingDown, Layers, Target,
  ArrowUpRight, ArrowDownRight, BarChart3, Compass,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface GapEvent {
  date: string;
  direction: 'up' | 'down';
  gapPct: number;
  openPrice: number;
  prevClose: number;
}

interface SMA50Data {
  value: number;
  above: boolean;
  deviation: number;
}

interface AnalystData {
  targetMean: number;
  targetHigh: number | null;
  targetLow: number | null;
  targetMedian: number | null;
  recommendation: string | null;
  numberOfAnalysts: number | null;
  upsideDownside: number | null;
  currentPrice: number;
}

interface ThemeData {
  sector: string;
  industry: string;
  classification: string;
  status: 'Leading' | 'Emerging' | 'Unknown';
}

interface TickerInsights {
  gaps: GapEvent[];
  sma50: SMA50Data | null;
  analyst: AnalystData | null;
  theme: ThemeData;
}

export function TickerInsightsCard({ insights }: { insights: TickerInsights | null }) {
  if (!insights) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-amber-500" />
          <CardTitle className="font-display text-lg tracking-tight">Ticker Insights</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Gap history • Theme classification • Analyst consensus • Trend position
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

          {/* ── Gap Events ────────────────────────────────────────── */}
          <InsightTile
            title="Recent Gaps"
            icon={<Zap className="h-4 w-4" />}
            accent="amber"
          >
            {(insights.gaps?.length ?? 0) > 0 ? (
              <div className="space-y-2">
                {insights.gaps.map((gap, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      {gap.direction === 'up' ? (
                        <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span className="text-muted-foreground font-mono">{gap.date}</span>
                    </div>
                    <span
                      className={`font-mono font-bold ${
                        gap.direction === 'up'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-500'
                      }`}
                    >
                      {gap.direction === 'up' ? '+' : ''}
                      {gap.gapPct}%
                    </span>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">
                  {insights.gaps.length === 1 ? '1 significant gap detected' : `${insights.gaps.length} latest gaps shown`}
                  {' '}(&ge;2% open vs prev close)
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-3 text-center">
                <Zap className="h-5 w-5 text-muted-foreground/40 mb-1" />
                <p className="text-xs text-muted-foreground">No significant gaps</p>
                <p className="text-[10px] text-muted-foreground/70">Price has been orderly</p>
              </div>
            )}
          </InsightTile>

          {/* ── Theme Classification ──────────────────────────────── */}
          <InsightTile
            title="Theme & Sector"
            icon={<Compass className="h-4 w-4" />}
            accent="violet"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
                <span className="font-semibold text-sm">{insights.theme.classification}</span>
              </div>
              {insights.theme.sector && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground min-w-[48px]">Sector</span>
                  <span className="text-xs font-mono">{insights.theme.sector}</span>
                </div>
              )}
              {insights.theme.industry && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground min-w-[48px]">Industry</span>
                  <span className="text-xs font-mono truncate" title={insights.theme.industry}>
                    {insights.theme.industry}
                  </span>
                </div>
              )}
              <Badge
                variant="outline"
                className={`text-[10px] font-mono mt-1 ${
                  insights.theme.status === 'Leading'
                    ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                    : insights.theme.status === 'Emerging'
                    ? 'border-amber-500/40 text-amber-600 dark:text-amber-400'
                    : 'border-muted-foreground/30 text-muted-foreground'
                }`}
              >
                {insights.theme.status === 'Leading' ? '▲ Leading theme' : insights.theme.status === 'Emerging' ? '● Emerging theme' : '— Unknown'}
              </Badge>
            </div>
          </InsightTile>

          {/* ── Analyst Consensus ─────────────────────────────────── */}
          <InsightTile
            title="Analyst Consensus"
            icon={<Target className="h-4 w-4" />}
            accent="blue"
          >
            {insights.analyst ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Mean Target</span>
                  <span className="font-mono font-bold text-sm">
                    ${insights.analyst.targetMean.toFixed(2)}
                  </span>
                </div>
                {insights.analyst.upsideDownside !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">vs Current</span>
                    <span
                      className={`font-mono font-bold text-sm ${
                        insights.analyst.upsideDownside >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-500'
                      }`}
                    >
                      {insights.analyst.upsideDownside >= 0 ? '+' : ''}
                      {insights.analyst.upsideDownside}%
                    </span>
                  </div>
                )}
                {/* Target range bar */}
                {insights.analyst.targetLow != null && insights.analyst.targetHigh != null &&
                 insights.analyst.targetLow > 0 && insights.analyst.targetHigh > insights.analyst.targetLow && (
                  <div className="pt-1">
                    <div className="flex justify-between text-[9px] text-muted-foreground font-mono mb-0.5">
                      <span>Low ${insights.analyst.targetLow.toFixed(0)}</span>
                      <span>High ${insights.analyst.targetHigh.toFixed(0)}</span>
                    </div>
                    <TargetRangeBar
                      low={insights.analyst.targetLow}
                      high={insights.analyst.targetHigh}
                      mean={insights.analyst.targetMean}
                      current={insights.analyst.currentPrice}
                    />
                  </div>
                )}
                <div className="flex items-center gap-2 pt-0.5">
                  {insights.analyst.recommendation && (
                    <RecommendationBadge rec={insights.analyst.recommendation} />
                  )}
                  {insights.analyst.numberOfAnalysts != null && (
                    <span className="text-[10px] text-muted-foreground">
                      {insights.analyst.numberOfAnalysts} analyst{insights.analyst.numberOfAnalysts !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-3 text-center">
                <Target className="h-5 w-5 text-muted-foreground/40 mb-1" />
                <p className="text-xs text-muted-foreground">No analyst data</p>
              </div>
            )}
          </InsightTile>

          {/* ── 50 SMA Position ───────────────────────────────────── */}
          <InsightTile
            title="50-Day SMA"
            icon={insights.sma50?.above ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            accent={insights.sma50?.above ? 'emerald' : 'red'}
          >
            {insights.sma50 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">SMA 50</span>
                  <span className="font-mono font-bold text-sm">
                    ${insights.sma50.value.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">Price vs SMA</span>
                  <span
                    className={`font-mono font-bold text-sm ${
                      insights.sma50.above
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-500'
                    }`}
                  >
                    {insights.sma50.above ? 'ABOVE' : 'BELOW'} ({insights.sma50.deviation >= 0 ? '+' : ''}{insights.sma50.deviation}%)
                  </span>
                </div>
                {/* Visual bar */}
                <div className="pt-1">
                  <SMAPositionBar
                    smaValue={insights.sma50.value}
                    currentPrice={insights.analyst?.currentPrice ?? 0}
                    above={insights.sma50.above}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {insights.sma50.above
                    ? 'Price above SMA = bullish trend. Pullbacks toward SMA may offer entry.'
                    : 'Price below SMA = bearish trend. SMA acts as dynamic resistance.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-3 text-center">
                <TrendingUp className="h-5 w-5 text-muted-foreground/40 mb-1" />
                <p className="text-xs text-muted-foreground">Insufficient data</p>
                <p className="text-[10px] text-muted-foreground/70">Need 50+ trading days</p>
              </div>
            )}
          </InsightTile>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

const ACCENT_STYLES: Record<string, string> = {
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  red: 'bg-red-500/10 text-red-500',
};

function InsightTile({
  title,
  icon,
  accent,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-3.5 space-y-2.5 hover:border-border/80 transition-colors">
      <div className="flex items-center gap-2">
        <div className={`flex items-center justify-center h-7 w-7 rounded-lg ${ACCENT_STYLES[accent] ?? ACCENT_STYLES.amber}`}>
          {icon}
        </div>
        <h4 className="font-display text-sm font-semibold tracking-tight">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function RecommendationBadge({ rec }: { rec: string }) {
  const styles: Record<string, string> = {
    strong_buy: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    buy: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    hold: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    sell: 'bg-red-500/10 text-red-500 border-red-500/20',
    strong_sell: 'bg-red-500/15 text-red-500 border-red-500/30',
  };
  const labels: Record<string, string> = {
    strong_buy: 'Strong Buy',
    buy: 'Buy',
    hold: 'Hold',
    sell: 'Sell',
    strong_sell: 'Strong Sell',
    underperform: 'Underperform',
    overweight: 'Overweight',
    outperform: 'Outperform',
    market_perform: 'Market Perform',
    sector_perform: 'Sector Perform',
  };
  const styleKey = rec in styles ? rec : 'hold';
  const label = labels[rec] ?? rec.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Badge variant="outline" className={`text-[10px] font-mono ${styles[styleKey]}`}>
      {label}
    </Badge>
  );
}

function TargetRangeBar({
  low,
  high,
  mean,
  current,
}: {
  low: number;
  high: number;
  mean: number;
  current: number;
}) {
  const range = high - low;
  if (range <= 0) return null;

  const clamped = (v: number) => Math.max(0, Math.min(100, ((v - low) / range) * 100));
  const meanPct = clamped(mean);
  const curPct = clamped(current);

  return (
    <div className="relative h-5">
      <div className="absolute inset-y-2 inset-x-0 h-1.5 rounded-full bg-gradient-to-r from-red-500/20 via-amber-500/20 to-emerald-500/20" />
      {/* Mean target marker */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-blue-500"
        style={{ left: `${meanPct}%` }}
        title={`Mean: $${mean.toFixed(2)}`}
      />
      {/* Current price marker */}
      <div
        className="absolute top-1.5 -translate-x-1/2"
        style={{ left: `${curPct}%` }}
        title={`Current: $${current.toFixed(2)}`}
      >
        <div className="h-2 w-2 rounded-full bg-amber-500 ring-2 ring-amber-500/20" />
      </div>
    </div>
  );
}

function SMAPositionBar({
  smaValue,
  currentPrice,
  above,
}: {
  smaValue: number;
  currentPrice: number;
  above: boolean;
}) {
  if (currentPrice <= 0 || smaValue <= 0) return null;
  const low = Math.min(currentPrice, smaValue);
  const high = Math.max(currentPrice, smaValue);
  const range = high - low;
  if (range <= 0) return null;

  const smaPct = ((smaValue - low) / range) * 100;
  const curPct = ((currentPrice - low) / range) * 100;

  return (
    <div className="relative h-6">
      <div className="absolute inset-y-2 inset-x-0 h-1.5 rounded-full bg-muted" />
      {/* SMA marker */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-muted-foreground"
        style={{ left: `${smaPct}%` }}
        title={`SMA 50: $${smaValue.toFixed(2)}`}
      >
        <span className="absolute -top-0.5 -translate-x-1/2 text-[8px] text-muted-foreground font-mono">SMA</span>
      </div>
      {/* Current price marker */}
      <div
        className="absolute top-1.5 -translate-x-1/2"
        style={{ left: `${curPct}%` }}
        title={`Price: $${currentPrice.toFixed(2)}`}
      >
        <div className={`h-3 w-3 rounded-full ${above ? 'bg-emerald-500' : 'bg-red-500'} ring-2 ring-background`} />
      </div>
    </div>
  );
}
