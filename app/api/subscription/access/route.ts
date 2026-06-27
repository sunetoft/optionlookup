export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasActiveSubscription, checkAnonymousAccess, getClientIdentifier, ANON_FREE_LOOKUPS } from '@/lib/subscription';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    const hasSub = await hasActiveSubscription(session.user.id);
    return NextResponse.json({
      authenticated: true,
      hasSubscription: hasSub,
      allowed: hasSub,
      remaining: hasSub ? Infinity : 0,
    });
  }

  // Anonymous — check rate limit
  const identifier = getClientIdentifier(req);
  const access = await checkAnonymousAccess(identifier);

  return NextResponse.json({
    authenticated: false,
    hasSubscription: false,
    allowed: access.allowed,
    remaining: access.remaining,
    quarantinedUntil: access.quarantinedUntil,
    totalAllowed: ANON_FREE_LOOKUPS,
  });
}
