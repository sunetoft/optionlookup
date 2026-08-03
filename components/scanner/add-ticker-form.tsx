'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Crown, Lock } from 'lucide-react';

interface TierInfo {
  limit: number | null;
  current: number;
  unlimited: boolean;
  canAdd: boolean;
}

interface AddTickerFormProps {
  onAdd: (ticker: string, priceTarget: number) => Promise<void>;
  tierInfo: TierInfo | null;
}

export function AddTickerForm({ onAdd, tierInfo }: AddTickerFormProps) {
  const [ticker, setTicker] = useState('');
  const [priceTarget, setPriceTarget] = useState('');
  const [adding, setAdding] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanTicker = ticker.toUpperCase().trim();
    const target = parseFloat(priceTarget);

    if (!cleanTicker) {
      toast.error('Enter a ticker symbol');
      return;
    }
    if (!target || target <= 0) {
      toast.error('Enter a valid price target');
      return;
    }

    setAdding(true);
    await onAdd(cleanTicker, target);
    setAdding(false);
    setTicker('');
    setPriceTarget('');
  };

  const locked = !!(tierInfo && !tierInfo.canAdd);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1 relative">
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="TICKER (e.g., AAPL)"
          className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-colors uppercase"
          maxLength={10}
        />
      </div>
      <div className="flex-1 relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</div>
        <input
          type="number"
          value={priceTarget}
          onChange={(e) => setPriceTarget(e.target.value)}
          placeholder="Price Target (USD)"
          step="0.01"
          min="0"
          className="w-full pl-7 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-colors"
        />
      </div>
      <button
        type="submit"
        disabled={adding || !!locked}
        className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
          locked
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
            : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
        }`}
      >
        {locked ? (
          <>
            <Lock className="h-4 w-4" />
            Limit Reached
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" />
            {adding ? 'Adding...' : 'Add Ticker'}
          </>
        )}
      </button>
    </form>
  );
}
