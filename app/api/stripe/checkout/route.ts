export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createCheckoutSession } from '@/lib/stripe';
import { TIERS, TierId } from '@/lib/subscription';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const tierId = body.tierId as TierId;

  if (!tierId || !TIERS[tierId]) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }

  const result = await createCheckoutSession({
    userId: session.user.id,
    email: session.user.email,
    tierId,
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
