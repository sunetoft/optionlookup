'use client';

import { AlertTriangle, CheckCircle, Calendar, Activity, BarChart3, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface WarningItem {
  value: number | null;
  safe: boolean;
  label: string;
  date?: string | null;
  ema?: number;
  high?: number;
  low?: number;
}

interface WarningsData {
  earnings: WarningItem;
  ema21: WarningItem;
  rsi: WarningItem;
  monthlyRange: WarningItem;
}

const warningConfig = [
  { key: 'earnings', icon: Calendar, title: 'Earnings Date' },
  { key: 'ema21', icon: TrendingUp, title: 'EMA 21 Deviation' },
  { key: 'rsi', icon: Activity, title: 'RSI (14)' },
  { key: 'monthlyRange', icon: BarChart3, title: 'Monthly Range' },
] as const;

export function WarningsCard({ warnings }: { warnings: WarningsData | null }) {
  if (!warnings) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-lg tracking-tight">Technical Warnings</CardTitle>
        <p className="text-sm text-muted-foreground">
          Safety checks for wheel strategy entry points
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {warningConfig.map(({ key, icon: Icon, title }) => {
            const warning = warnings[key];
            if (!warning) return null;
            return (
              <div
                key={key}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  warning.safe
                    ? 'bg-emerald-50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/30'
                    : 'bg-red-50 dark:bg-red-950/10 border-red-200 dark:border-red-900/30'
                }`}
              >
                <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  warning.safe
                    ? 'bg-emerald-100 dark:bg-emerald-900/30'
                    : 'bg-red-100 dark:bg-red-900/30'
                }`}>
                  {warning.safe ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <p className="text-xs font-medium text-muted-foreground">{title}</p>
                  </div>
                  <p className={`text-sm font-mono font-semibold mt-0.5 ${
                    warning.safe ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
                  }`}>
                    {warning.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
