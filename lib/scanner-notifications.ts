/**
 * Scanner Notifications — Discord webhook + email digest
 */

import { sendEmail } from '@/lib/email';
import { ScannerResult } from '@/lib/scanner-engine';
import { prisma } from '@/lib/db';

// ── Discord webhook ──────────────────────────────────────────────────

export async function sendScannerDiscordNotification(
  results: { ticker: string; result: ScannerResult }[],
): Promise<void> {
  const webhookUrl = process.env.SCANNER_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('[SCANNER/DISCORD] No webhook URL configured, skipping');
    return;
  }

  if (results.length === 0) {
    console.log('[SCANNER/DISCORD] No qualifying contracts found across all tickers, skipping');
    return;
  }

  const now = new Date();
  const scanLabel = now.getHours() < 14 ? '🌅 Morning Scan' : '🌆 Afternoon Scan';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // Build embed fields — up to 25 fields per embed (Discord limit)
  const fields: { name: string; value: string; inline?: boolean }[] = [];

  for (const { ticker, result } of results) {
    if (result.contracts.length === 0) continue;

    const best = result.bestContract;
    const distancePct = result.currentPrice > 0
      ? (((result.priceTarget - result.currentPrice) / result.currentPrice) * 100).toFixed(1)
      : '?';

    const top5 = result.contracts.slice(0, 5);
    const lines = top5.map((c) => {
      const badges: string[] = [];
      if (!c.dteInRange) badges.push(`DTE:${c.dte}`);
      if (c.earningsWarning) badges.push('⚠️ER');
      if (c.emWarning) badges.push('⚠️EM');
      const badgeStr = badges.length > 0 ? ` ${badges.join(' ')}` : '';
      return `\`$${c.strike}\` ${c.expiration} DTE:${c.dte} | $${c.bid.toFixed(2)} bid | **${c.roiPerDay.toFixed(2)}%/day**${badgeStr}`;
    });

    let value = lines.join('\n');
    if (result.contracts.length > 5) {
      value += `\n*+${result.contracts.length - 5} more contracts…*`;
    }
    value += `\n📊 Price: $${result.currentPrice.toFixed(2)} → Target: $${result.priceTarget.toFixed(0)} (${distancePct}% OTM)`;

    if (result.earningsDate) {
      value += `\n📅 Earnings: ${result.earningsDate}`;
    }

    fields.push({
      name: `**${ticker}** — ${result.contracts.length} contract${result.contracts.length !== 1 ? 's' : ''}${best ? ` | Best: ${best.roiPerDay.toFixed(2)}%/day @ $${best.strike}` : ''}`,
      value,
    });

    if (fields.length >= 25) break; // Discord embed limit
  }

  if (fields.length === 0) {
    console.log('[SCANNER/DISCORD] No contracts to report');
    return;
  }

  const payload = {
    embeds: [{
      title: `${scanLabel} — ${dateStr}`,
      description: `**${results.filter(r => r.result.contracts.length > 0).length} tickers** with qualifying CSP contracts found`,
      color: 0xf59e0b,
      fields,
      footer: { text: 'OptionLookup CSP Scanner' },
      timestamp: now.toISOString(),
    }],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`[SCANNER/DISCORD] Webhook failed: ${res.status} ${res.statusText}`);
      const body = await res.text();
      console.error(`[SCANNER/DISCORD] Response: ${body.slice(0, 200)}`);
    } else {
      console.log(`[SCANNER/DISCORD] Notification sent: ${fields.length} tickers`);
    }
  } catch (err: any) {
    console.error(`[SCANNER/DISCORD] Webhook error: ${err?.message}`);
  }
}

// ── Email digest ─────────────────────────────────────────────────────

export async function sendScannerEmailDigest(
  email: string,
  results: { ticker: string; result: ScannerResult }[],
): Promise<void> {
  if (results.length === 0 || !email) return;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Find userId for email log
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  // Build email HTML
  const tickerSections = results.map(({ ticker, result }) => {
    const top5 = result.contracts.slice(0, 5);
    const distancePct = result.currentPrice > 0
      ? (((result.priceTarget - result.currentPrice) / result.currentPrice) * 100).toFixed(1)
      : '?';

    const contractRows = top5.map((c, i) => `
      <tr style="border-bottom: 1px solid #334155;">
        <td style="padding: 8px 12px; color: #f1f5f9;">$${c.strike}</td>
        <td style="padding: 8px 12px; color: #94a3b8;">${c.expiration} (${c.dte}d)</td>
        <td style="padding: 8px 12px; color: #f59e0b; font-weight: 600;">$${c.bid.toFixed(2)}</td>
        <td style="padding: 8px 12px; color: #22c55e; font-weight: 600;">${c.roiPerDay.toFixed(2)}%</td>
        <td style="padding: 8px 12px;">${c.earningsWarning ? '<span style="color: #ef4444;">⚠️ ER</span>' : ''}</td>
        <td style="padding: 8px 12px;">${c.emWarning ? '<span style="color: #f59e0b;">⚠️ EM</span>' : ''}</td>
      </tr>
    `).join('');

    return `
      <div style="margin-bottom: 24px;">
        <h3 style="color: #f59e0b; margin: 0 0 8px 0; font-size: 18px;">
          ${ticker} — ${result.contracts.length} contract${result.contracts.length !== 1 ? 's' : ''}
        </h3>
        <p style="color: #94a3b8; font-size: 13px; margin: 0 0 12px 0;">
          Price: $${result.currentPrice.toFixed(2)} | Target: $${result.priceTarget.toFixed(2)} (${distancePct}% OTM)
          ${result.earningsDate ? `| Earnings: ${result.earningsDate}` : ''}
        </p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="border-bottom: 2px solid #475569;">
              <th style="padding: 8px 12px; text-align: left; color: #64748b;">Strike</th>
              <th style="padding: 8px 12px; text-align: left; color: #64748b;">Exp (DTE)</th>
              <th style="padding: 8px 12px; text-align: left; color: #64748b;">Bid</th>
              <th style="padding: 8px 12px; text-align: left; color: #64748b;">ROI/day</th>
              <th style="padding: 8px 12px;"></th>
              <th style="padding: 8px 12px;"></th>
            </tr>
          </thead>
          <tbody>${contractRows}</tbody>
        </table>
        ${result.contracts.length > 5 ? `<p style="color: #64748b; font-size: 12px; margin-top: 8px;">+${result.contracts.length - 5} more contracts…</p>` : ''}
      </div>
    `;
  }).join('');

  const totalContracts = results.reduce((sum, { result }) => sum + result.contracts.length, 0);

  await sendEmail({
    to: email,
    userId: user?.id,
    type: 'SCANNER_DIGEST',
    subject: `📊 CSP Scanner Digest — ${totalContracts} contracts across ${results.length} ticker${results.length !== 1 ? 's' : ''}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 700px; margin: 0 auto; padding: 32px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #78350f 100%); padding: 32px; border-radius: 12px;">
          <h1 style="color: #f59e0b; margin: 0 0 8px 0; font-size: 24px;">📊 CSP Scanner Digest</h1>
          <p style="color: #94a3b8; font-size: 14px; margin: 0 0 24px 0;">${dateStr}</p>
          <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6;">
            Found <strong style="color: #f59e0b;">${totalContracts}</strong> qualifying CSP contract${totalContracts !== 1 ? 's' : ''} across
            <strong style="color: #f59e0b;">${results.length}</strong> ticker${results.length !== 1 ? 's' : ''}.
          </p>
          ${tickerSections}
          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #334155;">
            <a href="${process.env.NEXTAUTH_URL}/scanner" style="display: inline-block; background: #f59e0b; color: #0f172a; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              View Full Dashboard →
            </a>
            <p style="color: #64748b; font-size: 12px; margin-top: 16px;">
              ⚠️ = Earnings before expiry | ⚠️ = Strike inside Expected Move
            </p>
          </div>
        </div>
      </div>
    `,
  });
}
