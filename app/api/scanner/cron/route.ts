export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { scanTicker, ScannerResult } from '@/lib/scanner-engine';
import { sendScannerDiscordNotification, sendScannerEmailDigest } from '@/lib/scanner-notifications';

/**
 * POST /api/scanner/cron
 * Headers: x-api-key: <CRON_API_KEY>
 *
 * Scheduled cron — scans ALL users' tickers, replaces results,
 * sends Discord notification + email digests.
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  const cronKey = process.env.CRON_API_KEY;

  if (!cronKey || apiKey !== cronKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[SCANNER/CRON] Starting scheduled scan');

  const scanType = 'scheduled';
  const allResults: { user: string; ticker: string; result: ScannerResult }[] = [];
  const userResults: Map<string, { email: string; results: { ticker: string; result: ScannerResult }[] }> = new Map();

  let totalTickers = 0;
  let totalQualified = 0;
  let totalErrors = 0;

  // Get all unique tickers across all users (scan each ticker once, then assign results)
  const allScanTickers = await prisma.scanTicker.findMany({
    include: {
      user: { select: { email: true } },
    },
  });

  // Group by ticker to avoid redundant API calls
  const tickerMap = new Map<string, { priceTarget: number; users: { id: string; email: string; scanTickerId: string }[] }>();

  for (const st of allScanTickers) {
    if (!tickerMap.has(st.ticker)) {
      tickerMap.set(st.ticker, { priceTarget: st.priceTarget, users: [] });
    }
    tickerMap.get(st.ticker)!.users.push({
      id: st.userId,
      email: st.user.email,
      scanTickerId: st.id,
    });
  }

  console.log(`[SCANNER/CRON] ${allScanTickers.length} scan tickers across ${tickerMap.size} unique tickers`);

  // Scan tickers in parallel batches to avoid timeout (5 at a time)
  const BATCH_SIZE = 5;
  const tickerEntries = Array.from(tickerMap.entries());

  for (let i = 0; i < tickerEntries.length; i += BATCH_SIZE) {
    const batch = tickerEntries.slice(i, i + BATCH_SIZE);
    console.log(`[SCANNER/CRON] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(tickerEntries.length / BATCH_SIZE)}: ${batch.map(([t]) => t).join(', ')}`);

    // Scan this batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(async ([ticker, info]) => {
        const result = await scanTicker(ticker, info.priceTarget);
        return { ticker, info, result };
      }),
    );

    // Process batch results sequentially (DB writes)
    for (const settled of batchResults) {
      if (settled.status === 'rejected') {
        totalErrors++;
        console.error(`[SCANNER/CRON] Batch error:`, settled.reason?.message);
        continue;
      }

      const { ticker, info, result } = settled.value;
      totalTickers++;

      if (result.error) {
        totalErrors++;
        console.error(`[SCANNER/CRON] ${ticker}: ${result.error}`);
        continue;
      }

      if (result.contracts.length > 0) {
        totalQualified += result.contracts.length;
      }

      // Save results for each user watching this ticker
      for (const user of info.users) {
        const scanRun = await prisma.scanRun.create({
          data: {
            userId: user.id,
            ticker,
            scanType,
            totalPuts: result.stats.totalPutsChecked,
            qualifiedPuts: result.putContracts.length,
            totalCalls: result.stats.totalCallsChecked,
            qualifiedCalls: result.callContracts.length,
            currentPrice: result.currentPrice,
            earningsDate: result.earningsDate,
            scanTickerId: user.scanTickerId,
          },
        });

        // Delete old results
        await prisma.scanResult.deleteMany({
          where: { scanTickerId: user.scanTickerId },
        });

        // Insert new results
        if (result.contracts.length > 0) {
          await prisma.scanResult.createMany({
            data: result.contracts.map((c) => ({
              scanTickerId: user.scanTickerId,
              scanRunId: scanRun.id,
              optionType: c.optionType,
              strike: c.strike,
              expiration: c.expiration,
              dte: c.dte,
              bid: c.bid,
              ask: c.ask,
              roiPerDay: c.roiPerDay,
              totalRoi: c.totalRoi,
              openInterest: c.openInterest,
              volume: c.volume,
              impliedVol: c.impliedVol,
              earningsWarning: c.earningsWarning,
              emWarning: c.emWarning,
            })),
          });
        }

        allResults.push({ user: user.id, ticker, result });

        // Track per-user for email digest
        if (!userResults.has(user.id)) {
          userResults.set(user.id, { email: user.email, results: [] });
        }
        userResults.get(user.id)!.results.push({ ticker, result });
      }
    }
  }

  console.log(`[SCANNER/CRON] Scan complete: ${totalTickers} tickers, ${totalQualified} qualified contracts, ${totalErrors} errors`);

  // Send Discord notification (aggregate of all newly found contracts)
  const contractsForDiscord = allResults
    .filter(({ result }) => result.contracts.length > 0)
    .map(({ ticker, result }) => ({ ticker, result }));
  try {
    await sendScannerDiscordNotification(contractsForDiscord);
  } catch (err: any) {
    console.error('[SCANNER/CRON] Discord notification failed:', err?.message);
  }

  // Send per-user email digests
  let emailsSent = 0;
  for (const [_userId, { email, results }] of userResults) {
    const hasContracts = results.some(({ result }) => result.contracts.length > 0);
    if (!hasContracts) continue;
    try {
      await sendScannerEmailDigest(
        email,
        results.filter(({ result }) => result.contracts.length > 0),
      );
      emailsSent++;
    } catch (err: any) {
      console.error(`[SCANNER/CRON] Email digest failed for ${email}:`, err?.message);
    }
  }

  console.log(`[SCANNER/CRON] Notifications: Discord sent, ${emailsSent} email digests sent`);

  return NextResponse.json({
    scanned: totalTickers,
    qualified: totalQualified,
    errors: totalErrors,
    emailsSent,
    scannedAt: new Date().toISOString(),
  });
}
