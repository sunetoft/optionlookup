'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, Crosshair, TrendingUp, Users, AlertTriangle, ShieldAlert } from 'lucide-react';

interface HeatmapEntry {
  ticker: string;
  userCount: number;
  bestRoi: number;
  bestContract: any | null;
  topContracts: any[];
  currentPrice: number | null;
  earningsDate: string | null;
  lastScanned: string | null;
}

interface HeatmapStats {
  totalUsers: number;
  totalTickers: number;
  tickersWithContracts: number;
  totalScanTickers: number;
}

export function HeatmapDashboard() {
  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([]);
  const [stats, setStats] = useState<HeatmapStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/scanner/heatmap')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) {
          setHeatmap(data.heatmap || []);
          setStats(data.stats || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Sub-header */}
      <div className="border-b border-slate-800 bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-4">
          <a href="/scanner" className="text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </a>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Crosshair className="h-6 w-6 text-amber-500" />
            Market Heatmap
          </h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
            Admin
          </span>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard icon={<Users className="h-5 w-5" />} label="Active Users" value={stats.totalUsers} color="text-blue-400" />
            <StatCard icon={<Crosshair className="h-5 w-5" />} label="Unique Tickers" value={stats.totalTickers} color="text-amber-400" />
            <StatCard icon={<TrendingUp className="h-5 w-5" />} label="With Contracts" value={stats.tickersWithContracts} color="text-green-400" />
            <StatCard icon={<Users className="h-5 w-5" />} label="Total Watchlist Entries" value={stats.totalScanTickers} color="text-purple-400" />
          </div>
        )}

        {/* Heatmap Table */}
        {heatmap.length === 0 ? (
          <div className="text-center py-20">
            <Crosshair className="h-16 w-16 text-slate-700 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-400 mb-2">No data yet</h3>
            <p className="text-sm text-slate-500">Run a scan to populate the heatmap.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs border-b border-slate-800">
                  <th className="text-left py-3 px-3 font-medium">#</th>
                  <th className="text-left py-3 px-3 font-medium">Ticker</th>
                  <th className="text-center py-3 px-3 font-medium">Users</th>
                  <th className="text-right py-3 px-3 font-medium">Price</th>
                  <th className="text-right py-3 px-3 font-medium">Best ROI/day</th>
                  <th className="text-right py-3 px-3 font-medium">Best Strike</th>
                  <th className="text-right py-3 px-3 font-medium">Bid</th>
                  <th className="text-center py-3 px-3 font-medium">DTE</th>
                  <th className="text-center py-3 px-3 font-medium">Flags</th>
                  <th className="text-left py-3 px-3 font-medium">Last Scan</th>
                </tr>
              </thead>
              <tbody>
                {heatmap.map((entry, i) => {
                  const c = entry.bestContract;
                  const roiColor = entry.bestRoi >= 0.3 ? 'text-green-400' : entry.bestRoi >= 0.15 ? 'text-amber-400' : 'text-slate-400';
                  return (
                    <tr key={entry.ticker} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3 text-slate-600">{i + 1}</td>
                      <td className="py-3 px-3">
                        <span className="font-bold text-slate-100">{entry.ticker}</span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                          {entry.userCount}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-slate-400">
                        {entry.currentPrice ? `$${entry.currentPrice.toFixed(2)}` : '-'}
                      </td>
                      <td className={`py-3 px-3 text-right font-semibold ${roiColor}`}>
                        {entry.bestRoi > 0 ? `${entry.bestRoi.toFixed(2)}%` : '-'}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-300">
                        {c ? `$${c.strike}` : '-'}
                      </td>
                      <td className="py-3 px-3 text-right text-amber-400">
                        {c ? `$${c.bid.toFixed(2)}` : '-'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {c ? (
                          <span className={c.dte >= 30 && c.dte <= 60 ? 'text-slate-300' : 'text-orange-400'}>
                            {c.dte}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {c && (
                          <div className="flex items-center justify-center gap-1">
                            {c.earningsWarning && <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                            {c.emWarning && <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600">
                        {entry.lastScanned
                          ? new Date(entry.lastScanned).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : 'Never'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Legend */}
            <div className="mt-3 flex items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-400" /> Expires after earnings</span>
              <span className="flex items-center gap-1"><ShieldAlert className="h-3 w-3 text-amber-400" /> Inside Expected Move</span>
              <span className="flex items-center gap-1"><span className="text-orange-400">⏱</span> DTE outside 30-60</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className={color}>{icon}</span>
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <span className="text-2xl font-bold text-slate-100">{value}</span>
    </div>
  );
}
