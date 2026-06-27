export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendCancellationEmail } from '@/lib/email';
import { TIERS } from '@/lib/subscription';
import Stripe from 'stripe';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sub = await prisma.subscription.findFirst({
    where: {
      userId: session.user.id,
      status: { in: ['ACTIVE', 'TRIALING'] },
    },
    orderBy: { currentPeriodEnd: 'desc' },
  });

  if (!sub?.stripeSubscriptionId) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
  }

  try {
    // Cancel at period end via Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-12-18.acacia' as any,
    });
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update local record
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true },
    });

    // Send cancellation email
    const tierName = (TIERS as any)[sub.tier]?.name ?? sub.tier;
    if (sub.currentPeriodEnd) {
      await sendCancellationEmail(session.user.email, session.user.id, tierName, sub.currentPeriodEnd);
    }

    return NextResponse.json({ success: true, cancelAtPeriodEnd: true });
  } catch (err: any) {
    console.error('[SUBSCRIPTION] Cancel error:', err?.message);
    return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 });
  }
}
