export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getActiveSubscription, TIERS } from '@/lib/subscription';

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({
      authenticated: false,
      hasActiveSubscription: false,
      tier: null,
    });
  }

  const sub = await getActiveSubscription(session.user.id);

  return NextResponse.json({
    authenticated: true,
    hasActiveSubscription: !!sub,
    subscription: sub ? {
      tier: sub.tier,
      tierName: (TIERS as any)[sub.tier]?.name ?? sub.tier,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      currentPeriodStart: sub.currentPeriodStart,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      priceDisplay: (TIERS as any)[sub.tier]?.priceDisplay,
    } : null,
  });
}
