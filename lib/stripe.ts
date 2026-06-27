import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { TIERS, TierId } from '@/lib/subscription';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  return new Stripe(key, { apiVersion: '2024-12-18.acacia' as any });
}

const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3099';

// ── Checkout ──

export async function createCheckoutSession({
  userId,
  email,
  tierId,
}: {
  userId: string;
  email: string;
  tierId: TierId;
}): Promise<{ url: string } | { error: string }> {
  try {
    const tier = TIERS[tierId];
    if (!tier?.stripePriceId) {
      return { error: 'Tier not configured with Stripe Price ID yet' };
    }

    const stripe = getStripe();

    // Check if customer already exists
    const existingSub = await prisma.subscription.findFirst({
      where: { userId, stripeCustomerId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    let customerId = existingSub?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : email,
      payment_method_types: ['card'],
      line_items: [{ price: tier.stripePriceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${APP_URL}/account?success=1`,
      cancel_url: `${APP_URL}/pricing?canceled=1`,
      metadata: { userId, tier: tierId },
      subscription_data: {
        metadata: { userId, tier: tierId },
      },
    });

    return { url: session.url! };
  } catch (err: any) {
    console.error('[STRIPE] Checkout error:', err?.message);
    return { error: err?.message ?? 'Failed to create checkout session' };
  }
}

// ── Portal ──

export async function createPortalSession({
  userId,
}: {
  userId: string;
}): Promise<{ url: string } | { error: string }> {
  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId, stripeCustomerId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    if (!sub?.stripeCustomerId) {
      return { error: 'No Stripe customer found' };
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${APP_URL}/account`,
    });

    return { url: session.url };
  } catch (err: any) {
    console.error('[STRIPE] Portal error:', err?.message);
    return { error: err?.message ?? 'Failed to create portal session' };
  }
}

// ── Webhook Processing ──

export async function processStripeEvent(event: Stripe.Event): Promise<void> {
  console.log(`[STRIPE WEBHOOK] Processing: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const tierId = session.metadata?.tier as TierId;

      if (!userId || !tierId) {
        console.error('[STRIPE WEBHOOK] Missing userId or tier in metadata');
        return;
      }

      // Get subscription details
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

      await prisma.subscription.create({
        data: {
          userId,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subscription.id,
          stripePriceId: subscription.items.data[0]?.price.id,
          tier: tierId,
          status: 'ACTIVE',
          currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
          currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { role: 'PAID' },
      });

      console.log(`[STRIPE WEBHOOK] Subscription created for user ${userId}, tier ${tierId}`);
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const subRecord = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscription.id },
      });

      if (!subRecord) {
        console.log('[STRIPE WEBHOOK] Subscription not found for update, skipping');
        return;
      }

      const status = subscription.status === 'active' ? 'ACTIVE'
        : subscription.status === 'trialing' ? 'TRIALING'
        : subscription.status === 'past_due' ? 'PAST_DUE'
        : subscription.status === 'canceled' ? 'CANCELED'
        : 'ACTIVE';

      await prisma.subscription.update({
        where: { id: subRecord.id },
        data: {
          status,
          currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
          currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          renewalReminderSent: false, // Reset reminder flag on renewal
        },
      });

      // Update user role if subscription ended
      if (status === 'CANCELED') {
        await prisma.user.update({
          where: { id: subRecord.userId },
          data: { role: 'FREE' },
        });
      }

      console.log(`[STRIPE WEBHOOK] Subscription updated: ${subscription.id}, status: ${status}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: { status: 'CANCELED' },
      });

      // Find the user
      const subRecord = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscription.id },
      });
      if (subRecord) {
        await prisma.user.update({
          where: { id: subRecord.userId },
          data: { role: 'FREE' },
        });
      }

      console.log(`[STRIPE WEBHOOK] Subscription deleted: ${subscription.id}`);
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      console.log(`[STRIPE WEBHOOK] Payment succeeded: ${invoice.id}, amount: ${invoice.amount_paid}`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      console.error(`[STRIPE WEBHOOK] Payment failed: ${invoice.id}`);
      break;
    }

    default:
      console.log(`[STRIPE WEBHOOK] Unhandled event: ${event.type}`);
  }
}
