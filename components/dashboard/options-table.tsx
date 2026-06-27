'use client';

import { useState } from 'react';
import { Filter, Loader2, TableIcon, ArrowDownUp, Info, Trophy, Brain, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface QualifiedPut {
  strike: number;
  expiration: string;
  dte: number;
  premium: number;
  bid: number;
  ask: number;
  roiPerDay: number;
  totalRoi: number;
  lowerBound: number;
  emSource?: string;
  openInterest: number;
  volume: number;
  impliedVolatility: number;
  pAssignment?: number;
  pProfit?: number;
  riskAdjustedRoi?: number;
  modelScore?: number;
  breakeven?: number;
}

interface ModelPick extends QualifiedPut {}

interface ScanStats {
  datesScanned: number;
  totalPutsChecked: number;
  reason?: string;
  rejections?: {
    lowStrike: number;
    noBid: number;
    lowRoi: number;
    aboveLowerBound: number;
  };
}

interface OptionsTableProps {
  ticker: string;
  expectedMoves: any[];
  earningsDate: string | null;
  currentPrice: number;
  timesfmEm?: any | null;
  timesfmTerm?: any | null;
}

export function OptionsTable({ ticker, expectedMoves, earningsDate, currentPrice, timesfmEm, timesfmTerm }: OptionsTableProps) {
  const [puts, setPuts] = useState<QualifiedPut[]>([]);
  const [modelPicks, setModelPicks] = useState<ModelPick[]>([]);
  const [hasModelScoring, setHasModelScoring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [totalFound, setTotalFound] = useState(0);
  const [scanStats, setScanStats] = useState<ScanStats | null>(null);
  const [dataSource, setDataSource] = useState<string>('');

  const fetchOptions = async () => {
    setLoading(true);
    setError(null);
    setScanStats(null);
    setModelPicks([]);
    setHasModelScoring(false);
    try {
      const res = await fetch('/api/stock/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, expectedMoves, earningsDate, currentPrice, timesfmEm, timesfmTerm }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('Unexpected server response'); }
      if (!res.ok) {
        if (data?.error === 'RATE_LIMITED') throw new Error('Free lookups used up. Sign up to scan options.');
        throw new Error(data?.error ?? 'Failed to fetch options');
      }
      setPuts(data?.qualifiedPuts ?? []);
      setTotalFound(data?.totalFound ?? 0);
      setScanStats(data?.scanStats ?? null);
      setDataSource(data?.dataSource ?? '');
      setModelPicks(data?.modelPicks ?? []);
      setHasModelScoring(data?.hasModelScoring ?? false);
      setFetched(true);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to analyze options');
    } finally {
      setLoading(false);
    }
  };

  const fmtPct = (v: number | undefined, decimals = 1) =>
    v != null ? `${(v * 100).toFixed(decimals)}%` : '—';

  const getProbColor = (p: number) =>
    p >= 0.85 ? 'text-emerald-600 dark:text-emerald-400'
    : p >= 0.65 ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-500';

  const getAssignColor = (p: number) =>
    p <= 0.15 ? 'text-emerald-600 dark:text-emerald-400'
    : p <= 0.35 ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-500';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg tracking-tight flex items-center gap-2">
            <Filter className="h-5 w-5 text-amber-500" />
            Qualified Put Options
          </CardTitle>
          <Button
            onClick={fetchOptions}
            disabled={loading}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning options chains...</>
            ) : fetched ? (
              <><ArrowDownUp className="h-4 w-4 mr-2" /> Refresh</>
            ) : (
              <><Filter className="h-4 w-4 mr-2" /> Find Puts</>
            )}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          ROI &gt; 0.09%/day • Strike ≤ expected move lower bound • Expiration before earnings
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm dark:bg-red-950/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* ── Model Top Picks ─────────────────────────────────────── */}
        {fetched && hasModelScoring && modelPicks.length > 0 && (
          <div className="rounded-lg border-2 border-violet-500/30 bg-violet-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-5 w-5 text-violet-500" />
              <h4 className="font-display font-semibold text-sm">TimesFM Model Top Picks</h4>
              <Badge variant="outline" className="text-[10px] font-mono border-violet-500/40 text-violet-600 dark:text-violet-400 ml-auto">
                <Brain className="h-3 w-3 mr-1" />
                Risk-adjusted ranking
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Ranked by model score = ROI/day × P(profit) × (1 − P(assignment)).
              Higher score = better risk-adjusted return.
            </p>
            <div className="space-y-2">
              {modelPicks.map((pick, i) => (
                <div
                  key={`pick-${i}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1.5 p-2.5 rounded-lg bg-background/50 border border-border/50"
                >
                  {/* Rank badge */}
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold font-mono ${
                      i === 0 ? 'bg-amber-400 text-amber-950' : i === 1 ? 'bg-slate-300 text-slate-700' : i === 2 ? 'bg-orange-300 text-orange-800' : 'bg-muted text-muted-foreground'
                    }`}>
                      {i + 1}
                    </span>
                    <span className="font-mono font-bold text-sm">${pick.strike.toFixed(2)}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">{pick.expiration}</Badge>
                    <span className="text-xs text-muted-foreground font-mono">{pick.dte}D</span>
                  </div>

                  {/* Premium */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">Bid</span>
                    <span className="font-mono text-sm font-medium">${pick.bid.toFixed(2)}</span>
                  </div>

                  {/* P(Profit) */}
                  <div className="flex items-center gap-1">
                    <ShieldCheck className={`h-3.5 w-3.5 ${getProbColor(pick.pProfit ?? 0)}`} />
                    <span className="text-[10px] text-muted-foreground">P(profit)</span>
                    <span className={`font-mono text-sm font-semibold ${getProbColor(pick.pProfit ?? 0)}`}>
                      {fmtPct(pick.pProfit, 0)}
                    </span>
                  </div>

                  {/* P(Assignment) */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">P(assign)</span>
                    <span className={`font-mono text-sm font-semibold ${getAssignColor(pick.pAssignment ?? 0)}`}>
                      {fmtPct(pick.pAssignment, 0)}
                    </span>
                  </div>

                  {/* Risk-adjusted ROI */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">Risk-adj ROI/day</span>
                    <span className="font-mono text-sm font-bold text-violet-600 dark:text-violet-400">
                      {(pick.riskAdjustedRoi ?? 0).toFixed(3)}%
                    </span>
                  </div>

                  {/* Breakeven */}
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-[10px] text-muted-foreground">Breakeven</span>
                    <span className="font-mono text-xs text-muted-foreground">${pick.breakeven?.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scan statistics */}
        {fetched && scanStats && (
          <div className="mb-2 p-3 rounded-lg bg-muted/50 text-sm space-y-1">
            <div className="flex items-center gap-2 font-medium">
              <Info className="h-4 w-4 text-muted-foreground" />
              Scan Summary
              {dataSource && (
                <Badge variant="outline" className="ml-2 text-xs font-mono">
                  via {dataSource === 'alpaca' ? 'Alpaca' : 'Yahoo Finance'}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-muted-foreground text-xs font-mono">
              <div>Dates scanned: <span className="text-foreground font-semibold">{scanStats.datesScanned}</span></div>
              <div>Puts checked: <span className="text-foreground font-semibold">{scanStats.totalPutsChecked}</span></div>
              <div>Qualified: <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{totalFound}</span></div>
              {scanStats.reason && <div className="col-span-2 text-amber-600">{scanStats.reason}</div>}
            </div>
            {scanStats.rejections && scanStats.totalPutsChecked > 0 && (
              <div className="text-xs text-muted-foreground mt-1 font-mono">
                Filtered out: {scanStats.rejections.noBid > 0 && <span>no bid ({scanStats.rejections.noBid}) </span>}
                {scanStats.rejections.aboveLowerBound > 0 && <span>• strike above expected move ({scanStats.rejections.aboveLowerBound}) </span>}
                {scanStats.rejections.lowRoi > 0 && <span>• ROI too low ({scanStats.rejections.lowRoi}) </span>}
                {scanStats.rejections.lowStrike > 0 && <span>• strike too low ({scanStats.rejections.lowStrike})</span>}
              </div>
            )}
          </div>
        )}

        {fetched && !loading && puts.length === 0 && !error && (
          <div className="p-6 text-center text-muted-foreground">
            <TableIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">No puts meeting all criteria were found.</p>
            <p className="text-xs mt-2 max-w-md mx-auto">
              This means no put options had both ROI &gt; 0.09%/day AND a strike price
              at or below the expected move lower bound. This is common for lower-volatility
              stocks or when expected moves are small.
            </p>
          </div>
        )}

        {fetched && puts.length > 0 && (
          <>
            <div className="mb-3">
              <Badge variant="secondary" className="font-mono">{totalFound} qualifying puts found</Badge>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-mono text-xs">Strike</TableHead>
                    <TableHead className="font-mono text-xs">Exp</TableHead>
                    <TableHead className="font-mono text-xs">DTE</TableHead>
                    <TableHead className="font-mono text-xs">Bid</TableHead>
                    <TableHead className="font-mono text-xs">ROI/Day</TableHead>
                    <TableHead className="font-mono text-xs">Total ROI</TableHead>
                    <TableHead className="font-mono text-xs">Exp. Move LB</TableHead>
                    <TableHead className="font-mono text-xs">EM Source</TableHead>
                    {hasModelScoring && <TableHead className="font-mono text-xs">P(Profit)</TableHead>}
                    {hasModelScoring && <TableHead className="font-mono text-xs">P(Assign)</TableHead>}
                    {hasModelScoring && <TableHead className="font-mono text-xs">Risk-Adj ROI</TableHead>}
                    <TableHead className="font-mono text-xs">OI</TableHead>
                    <TableHead className="font-mono text-xs">IV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {puts?.map?.((put: QualifiedPut, i: number) => (
                    <TableRow key={i} className="hover:bg-muted/50">
                      <TableCell className="font-mono font-semibold">${put?.strike?.toFixed?.(2) ?? '0'}</TableCell>
                      <TableCell className="font-mono text-sm">{put?.expiration ?? ''}</TableCell>
                      <TableCell className="font-mono text-sm">{put?.dte ?? 0}</TableCell>
                      <TableCell className="font-mono text-sm">${put?.bid?.toFixed?.(2) ?? '0'}</TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 font-mono">
                          {put?.roiPerDay?.toFixed?.(3) ?? '0'}%
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{put?.totalRoi?.toFixed?.(2) ?? '0'}%</TableCell>
                      <TableCell className="font-mono text-sm text-red-500">${put?.lowerBound?.toFixed?.(2) ?? '0'}</TableCell>
                      <TableCell>
                        {put?.emSource === 'timesfm' ? (
                          <Badge variant="outline" className="text-[10px] font-mono border-violet-500/50 text-violet-600 dark:text-violet-400">
                            TimesFM
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
                            Options
                          </Badge>
                        )}
                      </TableCell>
                      {hasModelScoring && (
                        <TableCell className={`font-mono text-sm font-medium ${getProbColor(put.pProfit ?? 0)}`}>
                          {put.pProfit != null ? fmtPct(put.pProfit, 0) : '—'}
                        </TableCell>
                      )}
                      {hasModelScoring && (
                        <TableCell className={`font-mono text-sm font-medium ${getAssignColor(put.pAssignment ?? 0)}`}>
                          {put.pAssignment != null ? fmtPct(put.pAssignment, 0) : '—'}
                        </TableCell>
                      )}
                      {hasModelScoring && (
                        <TableCell className="font-mono text-sm font-semibold text-violet-600 dark:text-violet-400">
                          {put.riskAdjustedRoi != null ? `${put.riskAdjustedRoi.toFixed(3)}%` : '—'}
                        </TableCell>
                      )}
                      <TableCell className="font-mono text-sm">{put?.openInterest ?? 0}</TableCell>
                      <TableCell className="font-mono text-sm">{((put?.impliedVolatility ?? 0) * 100)?.toFixed?.(1) ?? '0'}%</TableCell>
                    </TableRow>
                  )) ?? []}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {!fetched && !loading && (
          <div className="p-6 text-center text-muted-foreground">
            <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Click &quot;Find Puts&quot; to scan all option expirations for qualifying contracts.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
