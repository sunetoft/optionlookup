'use client';

import { useState } from 'react';
import {
  ChevronDown, ChevronRight, RefreshCw, Trash2, Loader2,
  TrendingUp, TrendingDown, AlertTriangle, ShieldAlert,
  Clock, Target,
} from 'lucide-react';

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

interface TickerRowProps {
  ticker: TickerData;
  isScanning: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onScan: () => void;
  onDelete: () => void;
}

export function TickerRow({
  ticker: t,
  isScanning,
  isExpanded,
  onToggleExpand,
  onScan,
  onDelete,
}: TickerRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const contracts = t.latestResults || [];
  const latestRun = t.scanRuns[0];
  const currentPrice = latestRun?.currentPrice ?? null;
  const earningsDate = latestRun?.earningsDate ?? null;

  const distancePct = currentPrice && currentPrice > 0
    ? (((t.priceTarget - currentPrice) / currentPrice) * 100).toFixed(1)
    : null;

  const lastScanDate = latestRun
    ? new Date(latestRun.scannedAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  const contractCount = contracts.length;
  const bestRoi = contracts.length > 0 ? contracts[0].roiPerDay : null;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden transition-colors hover:border-slate-700">
      {/* Summary Row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={onToggleExpand}
      >
        {/* Expand icon */}
        <button className="text-slate-500 hover:text-slate-300 transition-colors">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Ticker */}
        <div className="flex items-center gap-2 min-w-[80px]">
          <span className="font-bold text-lg text-slate-100">{t.ticker}</span>
        </div>

        {/* Price Target */}
        <div className="flex items-center gap-1.5 text-sm text-slate-400">
          <Target className="h-3.5 w-3.5 text-slate-500" />
          <span>${t.priceTarget.toFixed(2)}</span>
        </div>

        {/* Current Price (if available) */}
        {currentPrice && (
          <div className="text-sm text-slate-400 hidden sm:block">
            <span className="text-slate-500">Price: </span>
            <span className="text-slate-300">${currentPrice.toFixed(2)}</span>
          </div>
        )}

        {/* Distance */}
        {distancePct && (
          <div className={`text-xs px-2 py-0.5 rounded-full ${
            parseFloat(distancePct) > 0
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {parseFloat(distancePct) > 0 ? '+' : ''}{distancePct}% OTM
          </div>
        )}

        {/* Contract count */}
        <div className="flex items-center gap-1.5 ml-auto">
          {contractCount > 0 ? (
            <span className="flex items-center gap-1 text-sm px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <TrendingUp className="h-3.5 w-3.5" />
              {contractCount} contract{contractCount !== 1 ? 's' : ''}
              {bestRoi && <span className="text-xs ml-1 opacity-70">({bestRoi.toFixed(2)}%/d)</span>}
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-500">
              No contracts
            </span>
          )}

          {/* Last scan time */}
          {lastScanDate && (
            <span className="text-xs text-slate-600 hidden lg:inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastScanDate}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onScan}
            disabled={isScanning}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-amber-500 transition-colors disabled:opacity-50"
            title="Scan Now"
          >
            {isScanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => {
              if (confirmDelete) {
                onDelete();
              } else {
                setConfirmDelete(true);
                setTimeout(() => setConfirmDelete(false), 3000);
              }
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              confirmDelete
                ? 'bg-red-500/20 text-red-400'
                : 'hover:bg-slate-800 text-slate-400 hover:text-red-400'
            }`}
            title={confirmDelete ? 'Click again to confirm' : 'Remove ticker'}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expanded Contracts */}
      {isExpanded && (
        <div className="border-t border-slate-800 px-4 py-3">
          {/* Earnings warning */}
          {earningsDate && (
            <div className="mb-3 flex items-center gap-2 text-xs text-amber-400/80">
              <AlertTriangle className="h-3.5 w-3.5" />
              Next earnings: {earningsDate}
            </div>
          )}

          {contracts.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">
              No qualifying contracts found.
              {currentPrice && t.priceTarget >= currentPrice && (
                <span className="block mt-1 text-amber-500/60">
                  ⚠️ Your target ($${t.priceTarget.toFixed(2)}) is at or above current price ($${currentPrice.toFixed(2)}).
                  CSP puts are below the current price.
                </span>
              )}
            </div>
          ) : (
            <>
              {/* Contract Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 text-xs border-b border-slate-800">
                      <th className="text-left py-2 px-2 font-medium">Strike</th>
                      <th className="text-left py-2 px-2 font-medium">Expiration</th>
                      <th className="text-left py-2 px-2 font-medium">DTE</th>
                      <th className="text-right py-2 px-2 font-medium">Bid</th>
                      <th className="text-right py-2 px-2 font-medium">ROI/day</th>
                      <th className="text-right py-2 px-2 font-medium">Total ROI</th>
                      <th className="text-right py-2 px-2 font-medium">OI</th>
                      <th className="text-right py-2 px-2 font-medium">IV</th>
                      <th className="text-center py-2 px-2 font-medium">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c, i) => (
                      <tr
                        key={c.id || i}
                        className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-2 px-2">
                          <span className="font-semibold text-slate-100">${c.strike}</span>
                        </td>
                        <td className="py-2 px-2 text-slate-400">{c.expiration}</td>
                        <td className="py-2 px-2">
                          <span className={c.dte >= 30 && c.dte <= 60 ? 'text-slate-300' : 'text-orange-400'}>
                            {c.dte}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right text-amber-400 font-medium">
                          ${c.bid.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span className="text-green-400 font-semibold">{c.roiPerDay.toFixed(2)}%</span>
                        </td>
                        <td className="py-2 px-2 text-right text-slate-400">
                          {c.totalRoi.toFixed(1)}%
                        </td>
                        <td className="py-2 px-2 text-right text-slate-500 text-xs">
                          {c.openInterest > 0 ? c.openInterest.toLocaleString() : '-'}
                        </td>
                        <td className="py-2 px-2 text-right text-slate-500 text-xs">
                          {c.impliedVol > 0 ? `${(c.impliedVol * 100).toFixed(0)}%` : '-'}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {c.earningsWarning && (
                              <span title="Expires after earnings date" className="text-red-400">
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            )}
                            {c.emWarning && (
                              <span title="Strike inside Expected Move" className="text-amber-400">
                                <ShieldAlert className="h-3.5 w-3.5" />
                              </span>
                            )}
                            {!(c.dte >= 30 && c.dte <= 60) && (
                              <span title="DTE outside 30-60 range" className="text-orange-400 text-xs">
                                ⏱
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-red-400" /> Expires after earnings
                </span>
                <span className="flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3 text-amber-400" /> Inside Expected Move
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-orange-400">⏱</span> DTE outside 30-60
                </span>
              </div>

              {/* ROI History Sparkline */}
              {t.scanRuns.length > 1 && (
                <div className="mt-4 pt-3 border-t border-slate-800/50">
                  <RoiHistoryChart scanRuns={t.scanRuns} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline ROI History Sparkline ─────────────────────────────────────

function RoiHistoryChart({ scanRuns }: { scanRuns: ScanRun[] }) {
  const runs = [...scanRuns].reverse(); // chronological order
  const maxRoi = Math.max(...runs.map((r) => r.qualifiedPuts), 1);

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-600 whitespace-nowrap">ROI History:</span>
      <div className="flex items-end gap-1 h-8">
        {runs.map((run, i) => {
          const height = maxRoi > 0 ? (run.qualifiedPuts / maxRoi) * 100 : 0;
          return (
            <div
              key={run.id || i}
              className="group relative"
              title={`${new Date(run.scannedAt).toLocaleDateString()}: ${run.qualifiedPuts} contracts`}
            >
              <div
                className={`w-6 rounded-sm transition-all ${
                  run.qualifiedPuts > 0
                    ? 'bg-gradient-to-t from-amber-600 to-amber-400'
                    : 'bg-slate-800'
                }`}
                style={{ height: `${Math.max(height, 4)}%`, minHeight: '4px' }}
              />
            </div>
          );
        })}
      </div>
      <span className="text-xs text-slate-600">
        {runs.length} scan{runs.length !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
