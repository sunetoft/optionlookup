/**
 * Cron: Renewal Reminders for OptionLookup
 * Run directly with tsx: npx tsx scripts/cron-renewal-reminders.ts
 */

import { prisma } from '../lib/db';
import { sendRenewalReminder } from '../lib/email';
import { TIERS, RENEWAL_REMINDER_DAYS } from '../lib/subscription';

async function main() {
  const now = new Date();
  const reminderWindow = new Date();
  reminderWindow.setDate(reminderWindow.getDate() + RENEWAL_REMINDER_DAYS);

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
    if (!sub.user?.email) {
      console.log(`  [SKIP] subscription ${sub.id}: no user email`);
      continue;
    }

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
      console.log(`  [OK] Sent to ${sub.user.email} (${tierName})`);
      sent++;
    } else {
      console.log(`  [FAIL] Failed to send to ${sub.user.email}`);
      failed++;
    }
  }

  console.log(`\n[DONE] Processed: ${subscriptions.length} | Sent: ${sent} | Failed: ${failed}`);
  console.log(`Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);

  return { processed: subscriptions.length, sent, failed };
}

main()
  .then((result) => {
    console.log(JSON.stringify(result));
    process.exit(0);
  })
  .catch((err) => {
    console.error('[ERROR]', err);
    process.exit(1);
  });
