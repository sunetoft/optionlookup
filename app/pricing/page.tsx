import Link from 'next/link';
import { TIERS } from '@/lib/subscription';

export const metadata = {
  title: 'Pricing — OptionLookup',
  description: 'Choose your membership plan',
};

export default function PricingPage() {
  const tiers = Object.values(TIERS);
  const featured = tiers.find(t => t.id === 'SEMI_ANNUAL');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-amber-900/30">
      <nav className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-amber-500 text-2xl">🔍</span>
            <span className="text-xl font-bold text-slate-100 font-display">OptionLookup</span>
          </Link>
          <Link href="/dashboard" className="text-slate-400 hover:text-amber-500 transition text-sm">
            Back to Dashboard →
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-100 mb-4 font-display">
            Choose Your Plan
          </h1>
          <p className="text-slate-400 text-lg">
            Unlimited wheel strategy analysis, put scanning, and expected moves
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`relative rounded-2xl border p-6 transition ${
                featured?.id === tier.id
                  ? 'border-amber-500 bg-slate-800/80 shadow-xl shadow-amber-500/10 lg:scale-105'
                  : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
              }`}
            >
              {featured?.id === tier.id && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-amber-500 text-slate-900 text-xs font-bold px-3 py-1 rounded-full">
                    BEST VALUE
                  </span>
                </div>
              )}

              <h3 className="text-xl font-bold text-slate-100 mb-1">{tier.name}</h3>
              <p className="text-slate-400 text-sm mb-4 min-h-[40px]">{tier.description}</p>

              <div className="mb-6">
                <span className="text-4xl font-bold text-amber-500">{tier.priceDisplay}</span>
                <span className="text-slate-500 text-sm ml-2">{tier.perDayDisplay}</span>
              </div>

              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="text-amber-500">✓</span> Unlimited stock analysis
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="text-amber-500">✓</span> Unlimited put option scanning
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="text-amber-500">✓</span> Expected move calculations
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="text-amber-500">✓</span> Bookmark watchlist
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="text-amber-500">✓</span> Auto-renews (cancel anytime)
                </li>
              </ul>

              <a
                href="/login"
                className={`block w-full text-center py-3 rounded-lg font-semibold transition ${
                  featured?.id === tier.id
                    ? 'bg-amber-500 text-slate-900 hover:bg-amber-400'
                    : 'bg-slate-700 text-slate-100 hover:bg-slate-600'
                }`}
              >
                Get Started
              </a>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-slate-500 text-sm">
            Auto-renews until canceled. Cancel anytime from your account dashboard.
            No refunds for unused time — access continues until period end.
          </p>
        </div>

        <div className="mt-8 max-w-2xl mx-auto bg-slate-800/40 border border-slate-700 rounded-xl p-6">
          <h3 className="text-slate-200 font-semibold mb-2">Free Tier</h3>
          <p className="text-slate-400 text-sm">
            Not ready to commit? Try OptionLookup free with 5 stock lookups.
            After 5 unique tickers, there&apos;s a 5-day cooldown before you can try again.
          </p>
        </div>
      </div>
    </div>
  );
}
