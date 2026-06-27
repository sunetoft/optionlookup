import { prisma } from '@/lib/db';

export const TIERS = {
  MONTHLY: {
    id: 'MONTHLY',
    name: '30 Days',
    durationDays: 30,
    priceCents: 1000,
    priceDisplay: '$10',
    perDayDisplay: '$0.33/day',
    description: 'Perfect for trying out the wheel strategy scanner',
    stripePriceId: 'price_1TiihfK5WxhaRZkoxqbzTeGL',
    stripeNickname: 'optionlookup-monthly',
  },
  QUARTERLY: {
    id: 'QUARTERLY',
    name: '90 Days',
    durationDays: 90,
    priceCents: 2500,
    priceDisplay: '$25',
    perDayDisplay: '$0.28/day',
    description: 'Save 17% — great for active wheel traders',
    stripePriceId: 'price_1TiihgK5WxhaRZkodGVCXsyT',
    stripeNickname: 'optionlookup-quarterly',
  },
  SEMI_ANNUAL: {
    id: 'SEMI_ANNUAL',
    name: '180 Days',
    durationDays: 180,
    priceCents: 4500,
    priceDisplay: '$45',
    perDayDisplay: '$0.25/day',
    description: 'Save 25% — best value for serious traders',
    stripePriceId: 'price_1TiihgK5WxhaRZko9AhfLnfH',
    stripeNickname: 'optionlookup-semi-annual',
  },
  ANNUAL: {
    id: 'ANNUAL',
    name: '360 Days',
    durationDays: 360,
    priceCents: 8000,
    priceDisplay: '$80',
    perDayDisplay: '$0.22/day',
    description: 'Save 33% — maximum savings for power users',
    stripePriceId: 'price_1TiihhK5WxhaRZkoS7Pdv4LC',
    stripeNickname: 'optionlookup-annual',
  },
} as const;

export type TierId = keyof typeof TIERS;

export const ANON_FREE_LOOKUPS = 5;
export const ANON_QUARANTINE_DAYS = 5;
export const RENEWAL_REMINDER_DAYS = 4;

export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const sub = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ['ACTIVE', 'TRIALING'] },
      currentPeriodEnd: { gt: new Date() },
    },
    orderBy: { currentPeriodEnd: 'desc' },
  });
  return !!sub;
}

export async function getActiveSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ['ACTIVE', 'TRIALING'] },
      currentPeriodEnd: { gt: new Date() },
    },
    orderBy: { currentPeriodEnd: 'desc' },
  });
}

export interface AnonymousAccessResult {
  allowed: boolean;
  remaining: number;
  quarantinedUntil: Date | null;
  totalAllowed: number;
}

export async function checkAnonymousAccess(identifier: string): Promise<AnonymousAccessResult> {
  const usage = await prisma.anonymousUsage.findUnique({
    where: { identifier },
  });

  if (!usage) {
    return { allowed: true, remaining: ANON_FREE_LOOKUPS, quarantinedUntil: null, totalAllowed: ANON_FREE_LOOKUPS };
  }

  // Check quarantine
  if (usage.quarantinedUntil && usage.quarantinedUntil > new Date()) {
    return { allowed: false, remaining: 0, quarantinedUntil: usage.quarantinedUntil, totalAllowed: ANON_FREE_LOOKUPS };
  }

  // Quarantine expired — reset
  if (usage.quarantinedUntil && usage.quarantinedUntil <= new Date()) {
    await prisma.anonymousUsage.update({
      where: { identifier },
      data: { lookupCount: 0, tickersLooked: '', quarantinedUntil: null },
    });
    return { allowed: true, remaining: ANON_FREE_LOOKUPS, quarantinedUntil: null, totalAllowed: ANON_FREE_LOOKUPS };
  }

  // Count UNIQUE tickers looked up
  const tickers = usage.tickersLooked
    ? usage.tickersLooked.split(',').filter(Boolean)
    : [];
  const uniqueTickers = [...new Set(tickers)];

  if (uniqueTickers.length >= ANON_FREE_LOOKUPS) {
    // Trigger quarantine
    const quarantinedUntil = new Date();
    quarantinedUntil.setDate(quarantinedUntil.getDate() + ANON_QUARANTINE_DAYS);
    await prisma.anonymousUsage.update({
      where: { identifier },
      data: { quarantinedUntil },
    });
    return { allowed: false, remaining: 0, quarantinedUntil, totalAllowed: ANON_FREE_LOOKUPS };
  }

  return {
    allowed: true,
    remaining: ANON_FREE_LOOKUPS - uniqueTickers.length,
    quarantinedUntil: null,
    totalAllowed: ANON_FREE_LOOKUPS,
  };
}

export async function recordAnonymousLookup(identifier: string, ticker: string): Promise<void> {
  const existing = await prisma.anonymousUsage.findUnique({
    where: { identifier },
  });

  if (existing) {
    const tickers = existing.tickersLooked
      ? existing.tickersLooked.split(',').filter(Boolean)
      : [];
    if (!tickers.includes(ticker)) {
      tickers.push(ticker);
    }
    await prisma.anonymousUsage.update({
      where: { identifier },
      data: {
        lookupCount: { increment: 1 },
        tickersLooked: tickers.join(','),
        lastLookupAt: new Date(),
      },
    });
  } else {
    await prisma.anonymousUsage.create({
      data: {
        identifier,
        lookupCount: 1,
        tickersLooked: ticker,
      },
    });
  }
}

export function getClientIdentifier(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const cfConnecting = req.headers.get('cf-connecting-ip');
  
  if (cfConnecting) return cfConnecting;
  if (realIp) return realIp;
  if (forwarded) return forwarded.split(',')[0].trim();
  
  return 'unknown';
}
