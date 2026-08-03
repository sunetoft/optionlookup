'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Crosshair, Plus, Trash2, RefreshCw, Loader2,
  TrendingUp, AlertTriangle, ShieldAlert, Zap, Crown, Lock,
} from 'lucide-react';
import { TickerRow } from './ticker-row';
import { AddTickerForm } from './add-ticker-form';

interface ScanResult {
  id: string;
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
  scannedAt: string;
}

interface ScanRun {
  id: string;
  scanType: string;
  qualifiedPuts: number;
  currentPrice: number | null;
  earningsDate: string | null;
  scannedAt: string;
}

interface TickerData {
  id: string;
  ticker: string;
  priceTarget: number;
  createdAt: string;
  updatedAt: string;
  latestResults: ScanResult[];
  scanRuns: ScanRun[];
}

interface TierInfo {
  limit: number | null;
  current: number;
  unlimited: boolean;
  canAdd: boolean;
}

export function ScannerDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanningTickers, setScanningTickers] = useState<Set<string>>(new Set());
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  const fetchTickers = useCallback(async () => {
    try {
      const res = await fetch('/api/scanner/tickers');
      if (!res.ok) return;
      const data = await res.json();
      setTickers(data.tickers || []);
      setTierInfo(data.tierInfo || null);
    } catch {
      toast.error('Failed to load watchlist');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchTickers();
    } else if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/scanner');
    }
  }, [status, fetchTickers, router]);

  const handleScan = async (ticker: string) => {
    setScanningTickers((prev) => new Set(prev).add(ticker));
    try {
      const res = await fetch('/api/scanner/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Scan failed');
        return;
      }

      const data = await res.json();
      toast.success(`${ticker}: ${data.totalFound} contract${data.totalFound !== 1 ? 's' : ''} found`);

      // Update the ticker's results in state
      setTickers((prev) =>
        prev.map((t) =>
          t.ticker === ticker
            ? {
                ...t,
                latestResults: data.contracts.map((c: any, i: number) => ({
                  ...c,
                  id: `scan-${Date.now()}-${i}`,
                  scannedAt: data.scannedAt,
                })),
                scanRuns: [
                  {
                    id: `run-${Date.now()}`,
                    scanType: 'manual',
                    qualifiedPuts: data.totalFound,
                    currentPrice: data.currentPrice,
                    earningsDate: data.earningsDate,
                    scannedAt: data.scannedAt,
                  },
                  ...t.scanRuns.slice(0, 9),
                ],
              }
            : t,
        ),
      );
    } catch {
      toast.error('Scan request failed');
    } finally {
      setScanningTickers((prev) => {
        const next = new Set(prev);
        next.delete(ticker);
        return next;
      });
    }
  };

  const handleDelete = async (ticker: string) => {
    try {
      const res = await fetch('/api/scanner/tickers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });

      if (!res.ok) {
        toast.error('Failed to remove ticker');
        return;
      }

      setTickers((prev) => prev.filter((t) => t.ticker !== ticker));
      toast.success(`${ticker} removed from watchlist`);
    } catch {
      toast.error('Failed to remove ticker');
    }
  };

  const handleAdd = async (ticker: string, priceTarget: number) => {
    try {
      const res = await fetch('/api/scanner/tickers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, priceTarget }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error === 'TIER_LIMIT_REACHED') {
          toast.error(`Free tier limit: ${data.limit} tickers. Upgrade for unlimited.`);
          return;
        }
        toast.error(data.error || 'Failed to add ticker');
        return;
      }

      toast.success(`${ticker.toUpperCase()} added to watchlist`);
      await fetchTickers();
    } catch {
      toast.error('Failed to add ticker');
    }
  };

  const handleScanAll = async () => {
    for (const t of tickers) {
      await handleScan(t.ticker);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Scanner Sub-header */}
      <div className="border-b border-slate-800 bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Crosshair className="h-6 w-6 text-amber-500" />
              CSP Scanner
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {session?.user?.role === 'ADMIN' && (
              <a
                href="/scanner/heatmap"
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                📊 Heatmap
              </a>
            )}
            {tierInfo && (
              <span className={`text-xs px-3 py-1 rounded-full ${
                tierInfo.unlimited
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                {tierInfo.unlimited ? (
                  <span className="flex items-center gap-1"><Crown className="h-3 w-3" /> Unlimited</span>
                ) : (
                  `${tierInfo.current}/${tierInfo.limit} tickers`
                )}
              </span>
            )}
            {tickers.length > 0 && (
              <button
                onClick={handleScanAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-sm font-semibold transition-colors"
              >
                <Zap className="h-4 w-4" />
                Scan All
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Add Ticker Form */}
        <div className="mb-6">
          <AddTickerForm onAdd={handleAdd} tierInfo={tierInfo} />
        </div>

        {/* Ticker List */}
        {tickers.length === 0 ? (
          <div className="text-center py-20">
            <Crosshair className="h-16 w-16 text-slate-700 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-400 mb-2">No tickers yet</h3>
            <p className="text-sm text-slate-500">
              Add a ticker above with your target price to start scanning for CSP opportunities.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tickers.map((t) => (
              <TickerRow
                key={t.id}
                ticker={t}
                isScanning={scanningTickers.has(t.ticker)}
                isExpanded={expandedTicker === t.ticker}
                onToggleExpand={() =>
                  setExpandedTicker(expandedTicker === t.ticker ? null : t.ticker)
                }
                onScan={() => handleScan(t.ticker)}
                onDelete={() => handleDelete(t.ticker)}
              />
            ))}
          </div>
        )}

        {/* Info Banner */}
        <div className="mt-8 p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-slate-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-slate-400 space-y-1">
              <p><strong className="text-slate-300">How it works:</strong> Add tickers with your price target. The scanner runs twice daily (30 min after open, 60 min before close) and finds CSP puts with:</p>
              <ul className="list-disc list-inside ml-2 space-y-0.5 text-xs">
                <li>ROI ≥ 0.1% per trading day</li>
                <li>Strike ≤ your price target</li>
                <li>DTE ~30-60 days (loose — others shown with badge)</li>
                <li>⚠️ Earnings warning if contract expires after earnings</li>
                <li>⚠️ EM warning if strike is inside the Expected Move</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
