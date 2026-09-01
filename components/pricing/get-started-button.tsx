'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2 } from 'lucide-react';

export default function GetStartedButton({
  tierId,
  featured,
}: {
  tierId: string;
  featured: boolean;
}) {
  const { status } = useSession();
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleStart = async () => {
    // Not logged in (or session still loading) — send to login, return to pricing
    if (status !== 'authenticated') {
      router.push('/login?callbackUrl=/pricing');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId }),
      });
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        // Checkout needs auth or a valid price id — surface a useful error
        console.error('[pricing] Checkout error:', data.error);
        router.push('/login?callbackUrl=/pricing');
      }
    } catch {
      router.push('/login?callbackUrl=/pricing');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleStart}
      disabled={loading}
      className={`block w-full text-center py-3 rounded-lg font-semibold transition disabled:opacity-60 ${
        featured
          ? 'bg-amber-500 text-slate-900 hover:bg-amber-400'
          : 'bg-slate-700 text-slate-100 hover:bg-slate-600'
      }`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
      ) : (
        'Get Started'
      )}
    </button>
  );
}