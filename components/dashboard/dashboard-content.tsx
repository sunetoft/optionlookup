'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LogOut, Bookmark, BookmarkCheck, History, Search, ArrowDownToLine, Lock, Sparkles, X } from 'lucide-react';
import { TickerInput } from './ticker-input';
import { FundamentalsCard } from './fundamentals-card';
import { WarningsCard } from './warnings-card';
import { ExpectedMovesCard } from './expected-moves-card';
import { PriceChart } from './price-chart';
import { OptionsTable } from './options-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FadeIn, SlideIn } from '@/components/ui/animate';

interface AnalysisData {
  ticker: string;
  fundamentals: any;
  warnings: any;
  expectedMoves: any[];
  priceHistory: any[];
  earningsDate: string | null;
  earningsDaysAway: number | null;
  timesfmEm?: any | null;
  timesfmTerm?: any | null;
}

interface AnonAccess {
  remaining: number;
  totalAllowed: number;
  quarantinedUntil: string | null;
  allowed: boolean;
}

export function DashboardContent() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [recentTickers, setRecentTickers] = useState<string[]>([]);
  const [tsRegistered, setTsRegistered] = useState(false);
  const [tsStocks, setTsStocks] = useState<string[]>([]);

  // Anonymous rate-limit state
  const [anonAccess, setAnonAccess] = useState<AnonAccess | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const isAnonymous = status === 'unauthenticated';

  // Fetch anonymous access info on mount + when session changes
  useEffect(() => {
    if (status === 'loading') return;
    if (isAnonymous) {
      fetch('/api/subscription/access')
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data) {
            setAnonAccess({
              remaining: data.remaining,
              totalAllowed: data.totalAllowed ?? 5,
              quarantinedUntil: data.quarantinedUntil,
              allowed: data.allowed,
            });
            if (!data.allowed) setShowPaywall(true);
          }
        })
        .catch(() => {});
    }
  }, [status, isAnonymous]);

  // Fetch user data only when authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      fetchBookmarks();
      fetchHistory();
      fetchTradescouterStatus();
    }
  }, [status]);

  const fetchBookmarks = async () => {
    try {
      const res = await fetch('/api/bookmarks');
      if (res.ok) {
        const data = await res.json();
        setBookmarks((data ?? [])?.map?.((b: any) => b?.ticker ?? '') ?? []);
      }
    } catch (e: any) {
      console.error('Failed to fetch bookmarks:', e);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        const tickers = [...new Set((data ?? [])?.map?.((h: any) => h?.ticker ?? '') ?? [])] as string[];
        setRecentTickers(tickers.slice(0, 5));
      }
    } catch (e: any) {
      console.error('Failed to fetch history:', e);
    }
  };

  const fetchTradescouterStatus = async () => {
    try {
      const res = await fetch('/api/tradescouter/status');
      if (res.ok) {
        const data = await res.json();
        const registered = !!data?.registered;
        setTsRegistered(registered);
        if (registered) {
          fetchTradescouterStocks();
        }
      } else {
        setTsRegistered(false);
      }
    } catch (e: any) {
      console.error('Failed to fetch TradeScouter status:', e);
      setTsRegistered(false);
    }
  };

  const fetchTradescouterStocks = async () => {
    try {
      const res = await fetch('/api/tradescouter/stocks');
      if (res.ok) {
        const data = await res.json();
        setTsStocks((data?.stocks ?? []) as string[]);
      }
    } catch (e: any) {
      console.error('Failed to fetch imported stocks:', e);
    }
  };

  const handleRemoveTsStock = async (ticker: string) => {
    try {
      const res = await fetch('/api/tradescouter/stocks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      if (res.ok) {
        setTsStocks((prev) => prev.filter((t) => t !== ticker));
        toast.success(`Removed ${ticker} from imported stocks`);
      } else {
        toast.error('Failed to remove stock');
      }
    } catch (e: any) {
      console.error('Failed to remove imported stock:', e);
      toast.error('Failed to remove stock');
    }
  };

  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      console.error('Non-JSON response:', text.slice(0, 200));
      return { error: 'Unexpected server response. Please try again.' };
    }
  };

  const handleAnalyze = useCallback(async (ticker: string) => {
    setIsLoading(true);
    setAnalysisData(null);
    try {
      const res = await fetch('/api/stock/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await safeJson(res);

      // ── Rate limited — show paywall ──
      if (!res.ok && data?.error === 'RATE_LIMITED') {
        setShowPaywall(true);
        setAnonAccess(prev => ({ ...prev, remaining: 0, allowed: false, quarantinedUntil: data.quarantinedUntil }));
        toast.error('Free lookups exhausted. Sign up for unlimited access!');
        return;
      }

      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to analyze stock');
        return;
      }
      setAnalysisData(data);
      toast.success(`Analysis complete for ${ticker}`);

      // Update remaining count for anonymous
      if (isAnonymous) {
        setAnonAccess(prev => prev ? { ...prev, remaining: Math.max(0, prev.remaining - 1) } : null);
      }

      // Only save history if authenticated
      if (!isAnonymous) {
        try {
          await fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker, data }),
          });
          fetchHistory();
        } catch (e: any) {
          console.error('Failed to save history:', e);
        }
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isAnonymous]);

  const toggleBookmark = async (ticker: string) => {
    const isBookmarked = bookmarks?.includes?.(ticker) ?? false;
    try {
      if (isBookmarked) {
        await fetch(`/api/bookmarks?ticker=${ticker}`, { method: 'DELETE' });
        setBookmarks((prev) => (prev ?? [])?.filter?.((b: string) => b !== ticker) ?? []);
        toast.success(`Removed ${ticker} from bookmarks`);
      } else {
        await fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker }),
        });
        setBookmarks((prev) => [...(prev ?? []), ticker]);
        toast.success(`Added ${ticker} to bookmarks`);
      }
    } catch (e: any) {
      toast.error('Failed to update bookmark');
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // No more redirect — anonymous users can use the dashboard
  const currentTicker = analysisData?.ticker ?? '';
  const isBookmarked = currentTicker ? (bookmarks?.includes?.(currentTicker) ?? false) : false;
  const remaining = anonAccess?.remaining;
  const showRemainingBadge = isAnonymous && remaining !== undefined && remaining !== null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="max-w-[1200px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <Search className="h-4 w-4 text-white" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">OptionLookup</span>
          </div>
          <div className="flex items-center gap-3">
            {isAnonymous ? (
              <>
                {showRemainingBadge && (
                  <Badge variant="outline" className={`gap-1 ${remaining > 0 ? 'text-amber-600 border-amber-500/40' : 'text-red-500 border-red-500/40'}`}>
                    {remaining > 0 ? (
                      <><Sparkles className="h-3 w-3" /> {remaining} free lookup{remaining !== 1 ? 's' : ''} left</>
                    ) : (
                      <><Lock className="h-3 w-3" /> Locked</>
                    )}
                  </Badge>
                )}
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => router.push('/login?mode=signup')}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  Sign Up
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/login')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Sign In
                </Button>
              </>
            ) : (
              <>
                <span className="text-sm text-muted-foreground hidden md:block">
                  {session?.user?.name ?? session?.user?.email ?? ''}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="h-4 w-4 mr-1" /> Sign Out
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Paywall Modal */}
      {showPaywall && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <FadeIn>
            <div className="relative max-w-md w-full bg-card border border-border rounded-2xl shadow-2xl p-8 text-center">
              <button
                onClick={() => setShowPaywall(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-5">
                <Lock className="h-8 w-8 text-amber-500" />
              </div>

              <h2 className="font-display text-2xl font-bold mb-2">Free Lookups Used Up</h2>
              <p className="text-muted-foreground text-sm mb-2">
                You&apos;ve used all {anonAccess?.totalAllowed ?? 5} free stock lookups.
              </p>
              {anonAccess?.quarantinedUntil && (
                <p className="text-xs text-muted-foreground mb-6">
                  Your next batch of free lookups unlocks in{' '}
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    {Math.ceil((new Date(anonAccess.quarantinedUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} day(s)
                  </span>.
                  Or get unlimited access now.
                </p>
              )}

              <div className="space-y-3">
                <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-4 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <span className="font-semibold text-sm">Unlimited Lookups</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Starting at $10/month — analyze as many stocks as you want.
                  </p>
                </div>

                <Button
                  onClick={() => router.push('/login?mode=signup')}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold"
                  size="lg"
                >
                  Sign Up for Unlimited Access
                </Button>
                <Button
                  onClick={() => router.push('/pricing')}
                  variant="outline"
                  className="w-full"
                >
                  View Pricing Plans
                </Button>
                <Button
                  onClick={() => setShowPaywall(false)}
                  variant="ghost"
                  className="w-full text-muted-foreground"
                >
                  Maybe later
                </Button>
              </div>
            </div>
          </FadeIn>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-[1200px] mx-auto px-4 py-8">
        <FadeIn>
          <div className="text-center mb-8">
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-2">
              Wheel Strategy <span className="text-amber-500">Analysis</span>
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Analyze stocks, calculate expected moves, and find optimal put selling opportunities.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="flex justify-center mb-6">
            <TickerInput onAnalyze={handleAnalyze} isLoading={isLoading} />
          </div>
        </FadeIn>

        {/* Quick access: bookmarks + recent (authenticated only) */}
        {!isAnonymous && ((bookmarks?.length ?? 0) > 0 || (recentTickers?.length ?? 0) > 0) && (
          <FadeIn delay={0.2}>
            <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
              {(bookmarks ?? [])?.map?.((t: string) => (
                <Button
                  key={`bm-${t}`}
                  variant="outline"
                  size="sm"
                  onClick={() => handleAnalyze(t)}
                  className="font-mono text-xs gap-1"
                >
                  <BookmarkCheck className="h-3 w-3 text-amber-500" />
                  {t}
                </Button>
              )) ?? []}
              {(recentTickers ?? [])?.filter?.((t: string) => !(bookmarks ?? [])?.includes?.(t))?.map?.((t: string) => (
                <Button
                  key={`rc-${t}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAnalyze(t)}
                  className="font-mono text-xs gap-1 text-muted-foreground"
                >
                  <History className="h-3 w-3" />
                  {t}
                </Button>
              )) ?? []}
            </div>
          </FadeIn>
        )}

        {/* Stocks imported from Tradescouter (authenticated only) */}
        {!isAnonymous && tsRegistered && (
          <FadeIn delay={0.25}>
            <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownToLine className="h-4 w-4 text-amber-500" />
                <h2 className="font-display text-base font-semibold tracking-tight">
                  Stocks imported from Tradescouter
                </h2>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Click a ticker to analyze CSP opportunities
              </p>
              {(tsStocks?.length ?? 0) > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {(tsStocks ?? []).map((t: string) => (
                    <div
                      key={`ts-${t}`}
                      className="inline-flex items-center rounded-md border border-amber-500/40 bg-transparent"
                    >
                      <button
                        onClick={() => handleAnalyze(t)}
                        className="font-mono text-xs gap-1.5 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 px-2.5 py-1.5 transition-colors"
                      >
                        <span className="inline-flex items-center rounded bg-amber-500/15 px-1 py-0.5 text-[10px] font-bold leading-none text-amber-600 dark:text-amber-400">
                          TS
                        </span>
                        {t}
                      </button>
                      <button
                        onClick={() => handleRemoveTsStock(t)}
                        title={`Remove ${t}`}
                        className="px-1.5 py-1.5 text-muted-foreground/50 hover:text-red-500 transition-colors border-l border-amber-500/40"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <ArrowDownToLine className="h-6 w-6 text-amber-500/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No stocks imported yet. Add stocks from TradeScouter.
                  </p>
                </div>
              )}
            </div>
          </FadeIn>
        )}

        {/* Analysis Results */}
        {analysisData && (
          <div className="space-y-6">
            <SlideIn from="bottom" delay={0}>
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline" className="font-mono text-sm">
                  {currentTicker}
                </Badge>
                {/* Bookmark button only for authenticated users */}
                {!isAnonymous && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleBookmark(currentTicker)}
                    className={isBookmarked ? 'text-amber-500' : 'text-muted-foreground'}
                  >
                    {isBookmarked ? <BookmarkCheck className="h-4 w-4 mr-1" /> : <Bookmark className="h-4 w-4 mr-1" />}
                    {isBookmarked ? 'Bookmarked' : 'Bookmark'}
                  </Button>
                )}
              </div>
            </SlideIn>

            <SlideIn from="bottom" delay={0.05}>
              <FundamentalsCard data={analysisData?.fundamentals} />
            </SlideIn>

            <SlideIn from="bottom" delay={0.1}>
              <WarningsCard warnings={analysisData?.warnings} />
            </SlideIn>

            <SlideIn from="bottom" delay={0.15}>
              <ExpectedMovesCard
                moves={analysisData?.expectedMoves ?? []}
                currentPrice={analysisData?.fundamentals?.currentPrice ?? 0}
                timesfmEm={analysisData?.timesfmEm ?? null}
              />
            </SlideIn>

            <SlideIn from="bottom" delay={0.2}>
              <PriceChart
                priceHistory={analysisData?.priceHistory ?? []}
                expectedMoves={analysisData?.expectedMoves ?? []}
                currentPrice={analysisData?.fundamentals?.currentPrice ?? 0}
                timesfmEm={analysisData?.timesfmEm ?? null}
              />
            </SlideIn>

            <SlideIn from="bottom" delay={0.25}>
              <OptionsTable
                ticker={currentTicker}
                expectedMoves={analysisData?.expectedMoves ?? []}
                earningsDate={analysisData?.earningsDate ?? null}
                currentPrice={analysisData?.fundamentals?.currentPrice ?? 0}
                timesfmEm={analysisData?.timesfmEm ?? null}
                timesfmTerm={analysisData?.timesfmTerm ?? null}
              />
            </SlideIn>
          </div>
        )}

        {/* Empty state */}
        {!analysisData && !isLoading && (
          <FadeIn delay={0.3}>
            <div className="text-center py-16">
              <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center mx-auto mb-4">
                <Search className="h-8 w-8 text-amber-500" />
              </div>
              <h2 className="font-display text-xl font-semibold mb-2">Enter a ticker to get started</h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Type any stock ticker above to see fundamental analysis, technical warnings,
                expected moves, and qualifying put options for the wheel strategy.
              </p>
              {isAnonymous && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
                  {remaining !== undefined && remaining > 0
                    ? `${remaining} free lookup${remaining !== 1 ? 's' : ''} remaining — no signup needed!`
                    : 'Sign up for unlimited lookups.'}
                </p>
              )}
            </div>
          </FadeIn>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="max-w-[1200px] mx-auto px-4 py-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>© 2026 OptionLookup. For educational purposes only.</span>
            <span className="font-mono text-xs">Wheel Strategy Tool</span>
          </div>
          {/* Cross-site navigation */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border/50 pt-4">
            {[
              { label: 'BunnyStocks', href: 'https://bunnystocks.com' },
              { label: 'Warren', href: 'https://warren.bunnystocks.com' },
              { label: 'ThemeInvestor', href: 'https://themeinvestor.bunnystocks.com' },
              { label: 'OptionLookup', href: 'https://optionlookup.bunnystocks.com' },
              { label: 'HoldSell', href: 'https://holdsell.bunnystocks.com' },
              { label: 'TradeScouter', href: 'https://tradescouter.bunnystocks.com' },
            ].map((site) => (
              <a
                key={site.href}
                href={site.href}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {site.label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
