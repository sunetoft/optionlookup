'use client';

import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface TickerInputProps {
  onAnalyze: (ticker: string) => void;
  isLoading: boolean;
}

export function TickerInput({ onAnalyze, isLoading }: TickerInputProps) {
  const [ticker, setTicker] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ticker.trim() && !isLoading) {
      onAnalyze(ticker.trim().toUpperCase());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-md gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500" />
        <Input
          type="text"
          placeholder="Enter ticker symbol (e.g., AAPL)"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          disabled={isLoading}
          className="pl-10 font-mono uppercase"
          autoFocus
        />
      </div>
      <Button type="submit" disabled={isLoading || !ticker.trim()} className="bg-amber-500 hover:bg-amber-600 text-white">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        Analyze
      </Button>
    </form>
  );
}
