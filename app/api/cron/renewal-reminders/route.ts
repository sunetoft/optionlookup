export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendRenewalReminder } from '@/lib/email';
import { TIERS, RENEWAL_REMINDER_DAYS } from '@/lib/subscription';

// This endpoint is called by a daily cron job
// It finds subscriptions renewing in exactly RENEWAL_REMINDER_DAYS (4) days
// and sends reminder emails that haven't been sent yet

export async function POST(req: Request) {
  // Simple API key auth for cron
  const authHeader = req.headers.get('authorization');
  const cronKey = process.env.CRON_API_KEY;
  
  // Fail-closed: if CRON_API_KEY is unset OR the header doesn't match, reject.
  // (Previously used `cronKey && ...`, which skipped auth entirely when the env
  // var was missing — allowing anyone to trigger bulk reminder emails.)
  if (!cronKey || authHeader !== `Bearer ${cronKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const reminderWindow = new Date();
  reminderWindow.setDate(reminderWindow.getDate() + RENEWAL_REMINDER_DAYS);
  
  // Add a small window (1 hour) to catch subscriptions
  const windowStart = new Date(reminderWindow.getTime() - 30 * 60 * 1000);
  const windowEnd = new Date(reminderWindow.getTime() + 30 * 60 * 1000);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      cancelAtPeriodEnd: false,
      renewalReminderSent: false,
      currentPeriodEnd: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    include: {
      user: true,
    },
  });

  console.log(`[CRON] Found ${subscriptions.length} subscriptions needing renewal reminders`);

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    if (!sub.user?.email) continue;
    
    const tier = (TIERS as any)[sub.tier];
    const tierName = tier?.name ?? sub.tier;
    const price = tier?.priceDisplay ?? '';
    
    const success = await sendRenewalReminder(
      sub.user.email,
      sub.userId,
      tierName,
      sub.currentPeriodEnd!,
      price,
    );

    if (success) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { renewalReminderSent: true },
      });
      sent++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({
    processed: subscriptions.length,
    sent,
    failed,
    window: { start: windowStart, end: windowEnd },
  });
}
