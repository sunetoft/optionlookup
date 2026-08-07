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

    const bestPut = result.bestPut;
    const bestCall = result.bestCall;
    const distancePct = result.currentPrice > 0
      ? (((result.priceTarget - result.currentPrice) / result.currentPrice) * 100).toFixed(1)
      : '?';

    const lines: string[] = [];
    if (result.putContracts.length > 0) {
      lines.push(`**CSP Puts** (${result.putContracts.length}):`);
      for (const c of result.putContracts.slice(0, 4)) {
        const badges: string[] = [];
        if (!c.dteInRange) badges.push(`DTE:${c.dte}`);
        if (c.earningsWarning) badges.push('⚠️ER');
        if (c.emWarning) badges.push('⚠️EM');
        const badgeStr = badges.length > 0 ? ` ${badges.join(' ')}` : '';
        lines.push(`\`$${c.strike}\` ${c.expiration} DTE:${c.dte} | $${c.bid.toFixed(2)} bid | **${c.roiPerDay.toFixed(2)}%/day**${badgeStr}`);
      }
      if (result.putContracts.length > 4) lines.push(`*+${result.putContracts.length - 4} more puts…*`);
    }
    if (result.callContracts.length > 0) {
      lines.push(`**Covered Calls** (${result.callContracts.length}):`);
      for (const c of result.callContracts.slice(0, 4)) {
        const badges: string[] = [];
        if (!c.dteInRange) badges.push(`DTE:${c.dte}`);
        if (c.earningsWarning) badges.push('⚠️ER');
        if (c.emWarning) badges.push('⚠️EM');
        const badgeStr = badges.length > 0 ? ` ${badges.join(' ')}` : '';
        lines.push(`\`$${c.strike}\` ${c.expiration} DTE:${c.dte} | $${c.bid.toFixed(2)} bid | **${c.roiPerDay.toFixed(2)}%/day**${badgeStr}`);
      }
      if (result.callContracts.length > 4) lines.push(`*+${result.callContracts.length - 4} more calls…*`);
    }

    let value = lines.join('\n');
    value += `\n📊 Price: $${result.currentPrice.toFixed(2)} → Target: $${result.priceTarget.toFixed(0)} (${distancePct}% OTM)`;

    if (result.earningsDate) {
      value += `\n📅 Earnings: ${result.earningsDate}`;
    }

    const bestBits: string[] = [];
    if (bestPut) bestBits.push(`Put ${bestPut.roiPerDay.toFixed(2)}%/d`);
    if (bestCall) bestBits.push(`CC ${bestCall.roiPerDay.toFixed(2)}%/d`);
    fields.push({
      name: `**${ticker}** — ${result.putContracts.length}CSP + ${result.callContracts.length}CC${bestBits.length ? ` | Best: ${bestBits.join(', ')}` : ''}`,
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
      description: `**${results.filter(r => r.result.contracts.length > 0).length} tickers** with qualifying wheel contracts found`,
      color: 0xf59e0b,
      fields,
      footer: { text: 'OptionLookup Wheel Scanner' },
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
    const distancePct = result.currentPrice > 0
      ? (((result.priceTarget - result.currentPrice) / result.currentPrice) * 100).toFixed(1)
      : '?';

    const buildRows = (contracts: typeof result.putContracts, color: string) => contracts.map((c, i) => `
      <tr style="border-bottom: 1px solid #334155;">
        <td style="padding: 8px 12px; color: #f1f5f9;">$${c.strike} <span style="color: ${color}; font-size: 11px;">${c.optionType === 'CALL' ? 'CALL' : 'PUT'}</span></td>
        <td style="padding: 8px 12px; color: #94a3b8;">${c.expiration} (${c.dte}d)</td>
        <td style="padding: 8px 12px; color: #f59e0b; font-weight: 600;">$${c.bid.toFixed(2)}</td>
        <td style="padding: 8px 12px; color: #22c55e; font-weight: 600;">${c.roiPerDay.toFixed(2)}%</td>
        <td style="padding: 8px 12px;">${c.earningsWarning ? '<span style="color: #ef4444;">⚠️ ER</span>' : ''}</td>
        <td style="padding: 8px 12px;">${c.emWarning ? '<span style="color: #f59e0b;">⚠️ EM</span>' : ''}</td>
      </tr>
    `).join('');

    const putRows = buildRows(result.putContracts.slice(0, 5), '#38bdf8');
    const callRows = buildRows(result.callContracts.slice(0, 5), '#a78bfa');

    let sections = '';
    if (result.putContracts.length > 0) {
      sections += `
        <h4 style="color: #38bdf8; margin: 16px 0 6px 0; font-size: 15px;">🟦 CSP Puts (${result.putContracts.length})</h4>
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
          <tbody>${putRows}</tbody>
        </table>
        ${result.putContracts.length > 5 ? `<p style="color: #64748b; font-size: 12px;">+${result.putContracts.length - 5} more puts…</p>` : ''}
      `;
    }
    if (result.callContracts.length > 0) {
      sections += `
        <h4 style="color: #a78bfa; margin: 16px 0 6px 0; font-size: 15px;">🟪 Covered Calls (${result.callContracts.length})</h4>
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
          <tbody>${callRows}</tbody>
        </table>
        ${result.callContracts.length > 5 ? `<p style="color: #64748b; font-size: 12px;">+${result.callContracts.length - 5} more calls…</p>` : ''}
      `;
    }

    return `
      <div style="margin-bottom: 24px;">
        <h3 style="color: #f59e0b; margin: 0 0 8px 0; font-size: 18px;">
          ${ticker} — ${result.putContracts.length}CSP + ${result.callContracts.length}CC
        </h3>
        <p style="color: #94a3b8; font-size: 13px; margin: 0 0 12px 0;">
          Price: $${result.currentPrice.toFixed(2)} | Target: $${result.priceTarget.toFixed(2)} (${distancePct}% OTM)
          ${result.earningsDate ? `| Earnings: ${result.earningsDate}` : ''}
        </p>
        ${sections}
      </div>
    `;
  }).join('');

  const totalPuts = results.reduce((sum, { result }) => sum + result.putContracts.length, 0);
  const totalCalls = results.reduce((sum, { result }) => sum + result.callContracts.length, 0);
  const totalContracts = totalPuts + totalCalls;

  await sendEmail({
    to: email,
    userId: user?.id,
    type: 'SCANNER_DIGEST',
    subject: `📊 Wheel Scanner Digest — ${totalPuts}CSP + ${totalCalls}CC across ${results.length} ticker${results.length !== 1 ? 's' : ''}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 700px; margin: 0 auto; padding: 32px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #78350f 100%); padding: 32px; border-radius: 12px;">
          <h1 style="color: #f59e0b; margin: 0 0 8px 0; font-size: 24px;">📊 Wheel Scanner Digest</h1>
          <p style="color: #94a3b8; font-size: 14px; margin: 0 0 24px 0;">${dateStr}</p>
          <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6;">
            Found <strong style="color: #38bdf8;">${totalPuts}</strong> qualifying CSP put${totalPuts !== 1 ? 's' : ''} and
            <strong style="color: #a78bfa;">${totalCalls}</strong> qualifying covered call${totalCalls !== 1 ? 's' : ''} across
            <strong style="color: #f59e0b;">${results.length}</strong> ticker${results.length !== 1 ? 's' : ''}.
          </p>
          ${tickerSections}
          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #334155;">
            <a href="${process.env.NEXTAUTH_URL}/scanner" style="display: inline-block; background: #f59e0b; color: #0f172a; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              View Full Dashboard →
            </a>
            <p style="color: #64748b; font-size: 12px; margin-top: 16px;">
              ⚠️ = Earnings before expiry (DTE past report date) | ⚠️ = Strike inside Expected Move
            </p>
          </div>
        </div>
      </div>
    `,
  });
}
