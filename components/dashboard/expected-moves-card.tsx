'use client';

import { Target, ArrowUp, ArrowDown, Brain, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ExpectedMove {
  expiration: string;
  dte: number;
  type: string;
  straddle: number;
  expectedMove: number;
  upperBound: number;
  lowerBound: number;
  atmCallStrike: number;
  atmPutStrike: number;
}

interface TimesfmEm {
  pointForecast: number;
  p10: number;
  p20: number;
  p30: number;
  p40: number;
  p50: number;
  p60: number;
  p70: number;
  p80: number;
  p90: number;
  modelExpectedMove: number;
  modelRangeWidth: number;
  forecastReturn: number;
  horizon: number;
  contextPoints: number;
  verdict: string;
  verdictDetail: string;
}

interface ExpectedMovesCardProps {
  moves: ExpectedMove[];
  currentPrice: number;
  timesfmEm?: TimesfmEm | null;
}

const VERDICT_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; bg: string }> = {
  agreement: { icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  model_wider: { icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  options_richer: { icon: TrendingUp, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
  neutral: { icon: Brain, color: 'text-muted-foreground', bg: 'bg-muted/30 border-border' },
};

export function ExpectedMovesCard({ moves, currentPrice, timesfmEm }: ExpectedMovesCardProps) {
  if (!moves || moves.length === 0) return null;

  const verdict = timesfmEm?.verdict ?? 'neutral';
  const verdictConfig = VERDICT_CONFIG[verdict] ?? VERDICT_CONFIG.neutral;
  const VerdictIcon = verdictConfig.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-lg tracking-tight flex items-center gap-2">
          <Target className="h-5 w-5 text-amber-500" />
          Expected Moves
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          ATM straddle × 0.85 — strikes outside this range are safer for selling puts
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Options-Implied EM */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {moves.map((move, i) => (
            <div key={i} className="p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    {move.expiration}
                  </Badge>
                  <Badge variant={move.type === 'weekly' ? 'secondary' : 'default'} className="text-xs">
                    {move.type}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{move.dte} DTE</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Straddle</p>
                  <p className="font-mono font-semibold">${move.straddle.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expected Move</p>
                  <p className="font-mono font-semibold text-amber-500">±${move.expectedMove.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ArrowUp className="h-3 w-3 text-emerald-500" /> Upper Bound
                  </p>
                  <p className="font-mono font-semibold text-emerald-500">${move.upperBound.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ArrowDown className="h-3 w-3 text-red-500" /> Lower Bound
                  </p>
                  <p className="font-mono font-semibold text-red-500">${move.lowerBound.toFixed(2)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* TimesFM Model EM */}
        {timesfmEm && (
          <>
            <div className="flex items-center gap-2 pt-1">
              <Brain className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-medium font-display">TimesFM Model Forecast</span>
              <Badge variant="outline" className="text-[10px] font-mono ml-auto">
                {timesfmEm.horizon}D · {timesfmEm.contextPoints} bars · timesfm-2.5-200m
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Point forecast + quantile range */}
              <div className="p-4 rounded-lg border bg-violet-500/5 border-violet-500/20">
                <p className="text-xs text-muted-foreground mb-2">Forecast at expiry</p>
                <p className="font-mono font-bold text-lg text-violet-600 dark:text-violet-400">
                  ${timesfmEm.pointForecast.toFixed(2)}
                </p>
                <p className={`text-xs font-mono ${timesfmEm.forecastReturn >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {timesfmEm.forecastReturn >= 0 ? '+' : ''}{(timesfmEm.forecastReturn * 100).toFixed(1)}% from current
                </p>
              </div>

              {/* Quantile range */}
              <div className="p-4 rounded-lg border bg-violet-500/5 border-violet-500/20">
                <p className="text-xs text-muted-foreground mb-2">10th–90th percentile range</p>
                <div className="flex items-center justify-between font-mono text-sm">
                  <span className="text-red-500">${timesfmEm.p10.toFixed(2)}</span>
                  <span className="text-muted-foreground">—</span>
                  <span className="text-emerald-500">${timesfmEm.p90.toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Model EM: <span className="font-mono font-semibold text-violet-600 dark:text-violet-400">±${timesfmEm.modelExpectedMove.toFixed(2)}</span>
                  <span className="ml-2 text-muted-foreground/60">(width: ${timesfmEm.modelRangeWidth.toFixed(2)})</span>
                </p>
              </div>
            </div>

            {/* Quantile bar visualization */}
            <div className="px-2">
              <div className="relative h-6 rounded-full bg-muted overflow-hidden">
                {/* Full range bar p10 → p90 */}
                {(() => {
                  const allValues = [
                    ...moves.map(m => m.lowerBound),
                    ...moves.map(m => m.upperBound),
                    timesfmEm.p10,
                    timesfmEm.p90,
                    timesfmEm.pointForecast,
                    currentPrice,
                  ];
                  const minVal = Math.min(...allValues) * 0.99;
                  const maxVal = Math.max(...allValues) * 1.01;
                  const range = maxVal - minVal;
                  const pct = (v: number) => ((v - minVal) / range) * 100;

                  return (
                    <>
                      {/* Model range band */}
                      <div
                        className="absolute h-full bg-violet-500/20"
                        style={{ left: `${pct(timesfmEm.p10)}%`, width: `${pct(timesfmEm.p90) - pct(timesfmEm.p10)}%` }}
                      />
                      {/* Model point forecast */}
                      <div
                        className="absolute top-0 h-full w-0.5 bg-violet-500"
                        style={{ left: `${pct(timesfmEm.pointForecast)}%` }}
                        title={`Model FC: $${timesfmEm.pointForecast.toFixed(2)}`}
                      />
                      {/* Current price */}
                      <div
                        className="absolute top-0 h-full w-1 bg-primary"
                        style={{ left: `${pct(currentPrice)}%`, transform: 'translateX(-50%)' }}
                        title={`Current: $${currentPrice.toFixed(2)}`}
                      />
                    </>
                  );
                })()}
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-2 bg-violet-500/20 rounded-sm" /> Model 80% range
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-full bg-violet-500" style={{width: '2px', height: '10px'}} /> Model FC
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-full bg-primary" style={{width: '3px', height: '10px'}} /> Current
                </span>
              </div>
            </div>

            {/* Verdict */}
            <div className={`p-3 rounded-lg border ${verdictConfig.bg} flex items-start gap-3`}>
              <VerdictIcon className={`h-5 w-5 ${verdictConfig.color} flex-shrink-0 mt-0.5`} />
              <div>
                <p className={`text-sm font-semibold ${verdictConfig.color}`}>
                  {verdict === 'agreement' && 'EM Agreement'}
                  {verdict === 'model_wider' && 'Risk Underpriced'}
                  {verdict === 'options_richer' && 'Premium Rich'}
                  {verdict === 'neutral' && 'Model Active'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {timesfmEm.verdictDetail}
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
