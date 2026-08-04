'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Crosshair, Plus, Trash2, RefreshCw, Loader2, Clock,
  TrendingUp, AlertTriangle, ShieldAlert, Zap, Crown, Lock,
  FolderOpen, Folder,
} from 'lucide-react';
import { TickerRow } from './ticker-row';
import { AddTickerForm } from './add-ticker-form';
import { CategoryManager, type Category } from './category-manager';
import { getColorClasses } from './category-colors';

// ── Fetch categories helper for parent components ──────────────
async function fetchCategoriesApi(): Promise<Category[]> {
  const res = await fetch('/api/scanner/categories');
  if (!res.ok) return [];
  const data = await res.json();
  return data.categories || [];
}

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
  categoryId: string | null;
  category: { id: string; name: string; color: string } | null;
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanningTickers, setScanningTickers] = useState<Set<string>>(new Set());
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  // Derive the most recent scan timestamp across all tickers
  const lastScanAt = tickers
    .flatMap((t) => t.scanRuns)
    .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())[0]?.scannedAt ?? null;

  const fetchTickers = useCallback(async () => {
    try {
      const [tickersRes, catsRes] = await Promise.all([
        fetch('/api/scanner/tickers'),
        fetch('/api/scanner/categories'),
      ]);
      if (tickersRes.ok) {
        const data = await tickersRes.json();
        setTickers(data.tickers || []);
        setTierInfo(data.tierInfo || null);
      }
      if (catsRes.ok) {
        const catData = await catsRes.json();
        setCategories(catData.categories || []);
      }
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

  // Assign a single ticker to a category
  const handleTickerCategoryChange = async (ticker: string, categoryId: string | null) => {
    try {
      const res = await fetch('/api/scanner/tickers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, categoryId }),
      });
      if (!res.ok) {
        toast.error('Failed to update category');
        return;
      }
      // Update local state
      setTickers((prev) =>
        prev.map((t) => {
          if (t.ticker !== ticker) return t;
          const cat = categoryId ? categories.find((c) => c.id === categoryId) : null;
          return {
            ...t,
            categoryId,
            category: cat ? { id: cat.id, name: cat.name, color: cat.color } : null,
          };
        }),
      );
      toast.success(`${ticker} moved to ${categoryId ? categories.find((c) => c.id === categoryId)?.name : 'Uncategorized'}`);
      // Refresh category counts
      const cats = await fetchCategoriesApi();
      setCategories(cats);
    } catch {
      toast.error('Failed to update category');
    }
  };

  // Batch assign multiple tickers to a category
  const handleBatchAssign = async (categoryId: string, tickerSymbols: string[]) => {
    try {
      const res = await fetch('/api/scanner/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch-assign', categoryId, tickers: tickerSymbols }),
      });
      if (!res.ok) {
        toast.error('Batch assign failed');
        return;
      }
      toast.success(`${tickerSymbols.length} ticker${tickerSymbols.length !== 1 ? 's' : ''} assigned`);
      // Refresh both tickers (with new category) and category counts
      await fetchTickers();
      const cats = await fetchCategoriesApi();
      setCategories(cats);
    } catch {
      toast.error('Batch assign failed');
    }
  };

  const handleCategoriesChanged = useCallback(() => {
    fetchTickers();
  }, [fetchTickers]);

  // ── Group tickers by category for display ────────────────────
  const groupedTickers = (() => {
    const groups: { categoryId: string | null; categoryName: string; color: string; tickers: TickerData[] }[] = [];

    // Known categories (show even if empty — but only if user has tickers)
    for (const cat of categories) {
      const catTickers = tickers.filter((t) => t.categoryId === cat.id);
      groups.push({ categoryId: cat.id, categoryName: cat.name, color: cat.color, tickers: catTickers });
    }

    // Uncategorized (only show if any uncategorized tickers exist)
    const uncategorized = tickers.filter((t) => !t.categoryId);
    if (uncategorized.length > 0) {
      groups.push({ categoryId: null, categoryName: 'Uncategorized', color: 'slate', tickers: uncategorized });
    }

    return groups;
  })();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  const renderTickerRow = (t: TickerData) => (
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
      categories={categories}
      onCategoryChange={(categoryId) => handleTickerCategoryChange(t.ticker, categoryId)}
    />
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Scanner Sub-header */}
      <div className="border-b border-slate-800 bg-slate-900/50">
        <div className="mx-auto max-w-[1600px] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Crosshair className="h-6 w-6 text-amber-500" />
              CSP Scanner
            </h1>
            {lastScanAt && (
              <span className="flex items-center gap-1 text-xs text-slate-500 ml-3">
                <Clock className="h-3 w-3" />
                Last scan: {new Date(lastScanAt).toLocaleString('en-US', {
                  month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen',
                })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
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

      <main className="mx-auto max-w-[1600px] px-6 py-8">
        {/* Add Ticker Form */}
        <div className="mb-4">
          <AddTickerForm onAdd={handleAdd} tierInfo={tierInfo} />
        </div>

        {/* Category Manager */}
        {tickers.length > 0 && (
          <div className="mb-6 p-3 bg-slate-900/30 border border-slate-800 rounded-xl">
            <CategoryManager
              tickers={tickers.map((t) => ({ id: t.id, ticker: t.ticker, categoryId: t.categoryId }))}
              onCategoriesChanged={handleCategoriesChanged}
              onBatchAssign={handleBatchAssign}
            />
          </div>
        )}

        {/* Ticker Groups */}
        {tickers.length === 0 ? (
          <div className="text-center py-20">
            <Crosshair className="h-16 w-16 text-slate-700 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-400 mb-2">No tickers yet</h3>
            <p className="text-sm text-slate-500">
              Add a ticker above with your target price to start scanning for CSP opportunities.
            </p>
          </div>
        ) : groupedTickers.length === 0 || (categories.length === 0) ? (
          // No categories defined, show flat list
          <div className="space-y-3">
            {tickers.map(renderTickerRow)}
          </div>
        ) : (
          // Grouped into category cards
          <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
            {groupedTickers.map((group) => {
              const cc = getColorClasses(group.color);
              const totalContracts = group.tickers.reduce((sum, t) => sum + (t.latestResults?.length || 0), 0);
              const isUncategorized = group.categoryId === null;
              return (
                <div
                  key={group.categoryId || '__uncategorized'}
                  className={`rounded-xl border ${cc.border} bg-slate-900/30 overflow-hidden`}
                >
                  {/* Category Card Header */}
                  <div className={`flex items-center gap-2 px-4 py-3 ${cc.headerBg} border-b ${cc.border}`}>
                    {isUncategorized ? (
                      <Folder className={`h-5 w-5 ${cc.accent}`} />
                    ) : (
                      <FolderOpen className={`h-5 w-5 ${cc.accent}`} />
                    )}
                    <h2 className={`text-base font-bold ${cc.headerText}`}>{group.categoryName}</h2>
                    <span className="text-xs text-slate-500 ml-1">
                      {group.tickers.length} ticker{group.tickers.length !== 1 ? 's' : ''}
                    </span>
                    {totalContracts > 0 && (
                      <span className={`flex items-center gap-1 ml-auto text-xs px-2 py-0.5 rounded-full ${cc.badge}`}>
                        <TrendingUp className="h-3 w-3" />
                        {totalContracts} contract{totalContracts !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Tickers within this category */}
                  {group.tickers.length > 0 ? (
                    <div className="p-3 space-y-2">
                      {group.tickers.map(renderTickerRow)}
                    </div>
                  ) : (
                    <div className="px-4 py-6 text-center text-xs text-slate-600">
                      No tickers in this category yet. Assign tickers using the Batch Assign tool above.
                    </div>
                  )}
                </div>
              );
            })}
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
