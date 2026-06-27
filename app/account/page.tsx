'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [subStatus, setSubStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status === 'authenticated') {
      fetchSubStatus();
    }
  }, [status, router]);

  async function fetchSubStatus() {
    try {
      const res = await fetch('/api/subscription/status');
      const data = await res.json();
      setSubStatus(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!confirm("Cancel your membership? You'll keep access until the end of your current period. No refunds for unused time.")) return;
    setCanceling(true);
    try {
      const res = await fetch('/api/subscription/cancel', { method: 'POST' });
      if (res.ok) {
        setSuccessMsg('Your membership has been canceled. Access continues until the end of your billing period.');
        fetchSubStatus();
      }
    } catch {
      alert('Failed to cancel. Please try again.');
    } finally {
      setCanceling(false);
    }
  }

  async function handlePortal() {
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      alert('Failed to open billing portal');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-amber-900/30 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  const sub = subStatus?.subscription;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-amber-900/30">
      <nav className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-amber-500 text-2xl">🔍</span>
            <span className="text-xl font-bold text-slate-100 font-display">OptionLookup</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-slate-400 hover:text-amber-500 text-sm">Dashboard</Link>
            <Link href="/pricing" className="text-slate-400 hover:text-amber-500 text-sm">Pricing</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {successMsg && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-200">
            {successMsg}
          </div>
        )}

        <h1 className="text-3xl font-bold text-slate-100 mb-8 font-display">Account</h1>

        {/* Account Info */}
        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Profile</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Email</span>
              <span className="text-slate-200">{session?.user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Name</span>
              <span className="text-slate-200">{session?.user?.name || '—'}</span>
            </div>
          </div>
        </div>

        {/* Subscription Info */}
        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Membership</h2>

          {!sub ? (
            <div>
              <p className="text-slate-400 mb-4">You don&apos;t have an active membership.</p>
              <Link href="/pricing" className="inline-block bg-amber-500 text-slate-900 px-6 py-3 rounded-lg font-semibold hover:bg-amber-400 transition">
                View Plans →
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400 text-sm">Plan</span>
                  <p className="text-amber-500 font-semibold text-lg">{sub.tierName}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-sm">Status</span>
                  <p className="text-green-400 font-semibold">
                    {sub.cancelAtPeriodEnd ? 'Canceling' : 'Active'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-sm">Current Period</span>
                  <p className="text-slate-200 text-sm">
                    {sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toLocaleDateString() : '—'}
                    {' → '}
                    {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-sm">Price</span>
                  <p className="text-slate-200">{sub.priceDisplay}</p>
                </div>
              </div>

              {sub.cancelAtPeriodEnd && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-200 text-sm">
                  Your membership will end on {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : 'your next billing date'}. You keep full access until then.
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {!sub.cancelAtPeriodEnd && (
                  <button
                    onClick={handleCancel}
                    disabled={canceling}
                    className="px-4 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition text-sm font-medium disabled:opacity-50"
                  >
                    {canceling ? 'Canceling...' : 'Cancel Membership'}
                  </button>
                )}
                <button
                  onClick={handlePortal}
                  className="px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition text-sm font-medium"
                >
                  Stripe Billing Portal →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Billing note */}
        <div className="text-center text-slate-500 text-xs mt-8">
          Need help? Contact support. No refunds for unused time — access continues until period end.
        </div>
      </div>
    </div>
  );
}
