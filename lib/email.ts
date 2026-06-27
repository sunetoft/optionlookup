import nodemailer from 'nodemailer';
import { prisma } from '@/lib/db';

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  
  if (!user || !pass) {
    console.warn('[EMAIL] Gmail credentials not configured');
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

export async function sendEmail({
  to,
  subject,
  html,
  type,
  userId,
}: {
  to: string;
  subject: string;
  html: string;
  type: string;
  userId?: string;
}): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[EMAIL] Skipping ${type} email to ${to} — no transporter`);
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: `"OptionLookup" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });

    await prisma.emailLog.create({
      data: { userId, email: to, subject, type, success: true },
    });

    console.log(`[EMAIL] Sent ${type} to ${to}: ${info.messageId}`);
    return true;
  } catch (err: any) {
    console.error(`[EMAIL] Failed to send ${type} to ${to}:`, err?.message);
    await prisma.emailLog.create({
      data: { userId, email: to, subject, type, success: false, error: err?.message },
    }).catch(() => {});
    return false;
  }
}

export async function sendRenewalReminder(
  email: string,
  userId: string,
  tierName: string,
  renewalDate: Date,
  price: string,
): Promise<boolean> {
  const formattedDate = renewalDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return sendEmail({
    to: email,
    userId,
    type: 'RENEWAL_REMINDER',
    subject: `Your OptionLookup ${tierName} membership renews in 4 days`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #78350f 100%); padding: 32px; border-radius: 12px;">
          <h1 style="color: #f59e0b; margin: 0 0 24px 0; font-size: 24px;">OptionLookup</h1>
          <h2 style="color: #f1f5f9; margin: 0 0 16px 0; font-size: 20px;">Upcoming Renewal</h2>
          <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6;">
            Your <strong style="color: #f59e0b;">${tierName}</strong> membership will automatically renew on
            <strong>${formattedDate}</strong> for <strong>${price}</strong>.
          </p>
          <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin-top: 24px;">
            To manage your subscription or cancel, visit your
            <a href="${process.env.NEXTAUTH_URL}/account" style="color: #f59e0b;">account dashboard</a>.
          </p>
          <p style="color: #64748b; font-size: 12px; margin-top: 32px;">
            If you cancel, you'll keep access until the end of your current billing period. No refunds for unused time.
          </p>
        </div>
      </div>
    `,
  });
}

export async function sendWelcomeEmail(
  email: string,
  userId: string,
  tierName: string,
): Promise<boolean> {
  return sendEmail({
    to: email,
    userId,
    type: 'WELCOME',
    subject: `Welcome to OptionLookup ${tierName}! 🎉`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #78350f 100%); padding: 32px; border-radius: 12px;">
          <h1 style="color: #f59e0b; margin: 0 0 24px 0; font-size: 24px;">Welcome to OptionLookup! 🎉</h1>
          <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6;">
            You're now a <strong style="color: #f59e0b;">${tierName}</strong> member. Enjoy unlimited wheel strategy analysis,
            put option scanning, and expected move calculations.
          </p>
          <a href="${process.env.NEXTAUTH_URL}/dashboard" style="display: inline-block; background: #f59e0b; color: #0f172a; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 24px;">
            Start Analyzing →
          </a>
        </div>
      </div>
    `,
  });
}

export async function sendCancellationEmail(
  email: string,
  userId: string,
  tierName: string,
  accessUntil: Date,
): Promise<boolean> {
  const formattedDate = accessUntil.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return sendEmail({
    to: email,
    userId,
    type: 'CANCELLATION',
    subject: `OptionLookup ${tierName} membership canceled`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #78350f 100%); padding: 32px; border-radius: 12px;">
          <h1 style="color: #f59e0b; margin: 0 0 24px 0; font-size: 24px;">Membership Canceled</h1>
          <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6;">
            Your <strong style="color: #f59e0b;">${tierName}</strong> membership has been canceled.
            You'll keep access to all features until <strong>${formattedDate}</strong>.
          </p>
          <p style="color: #94a3b8; font-size: 14px; margin-top: 24px;">
            We'd love to have you back anytime. Visit
            <a href="${process.env.NEXTAUTH_URL}/pricing" style="color: #f59e0b;">our pricing page</a>
            to resubscribe.
          </p>
        </div>
      </div>
    `,
  });
}

export function forgotPasswordEmail(resetUrl: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'Reset your OptionLookup password';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #78350f 100%); padding: 32px; border-radius: 12px;">
        <h1 style="color: #f59e0b; margin: 0 0 24px 0; font-size: 24px;">OptionLookup</h1>
        <h2 style="color: #f1f5f9; margin: 0 0 16px 0; font-size: 20px;">Reset your password</h2>
        <p style="color: #cbd5e1; font-size: 16px; line-height: 1.6;">
          We received a request to reset the password for your OptionLookup account. Click the button below to choose a new password.
        </p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="display: inline-block; background: #f59e0b; color: #0f172a; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Reset Password
          </a>
        </p>
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6;">
          Or copy and paste this link into your browser:<br/>
          <a href="${resetUrl}" style="color: #f59e0b; word-break: break-all;">${resetUrl}</a>
        </p>
        <p style="color: #64748b; font-size: 12px; line-height: 1.6; margin-top: 24px;">
          This link will expire in 1 hour. If you didn&rsquo;t request a password reset, you can safely ignore this email &mdash; your password will not be changed.
        </p>
      </div>
    </div>
  `;
  const text = `Reset your OptionLookup password

We received a request to reset the password for your OptionLookup account. Visit the link below to choose a new password. This link will expire in 1 hour.

${resetUrl}

If you didn't request a password reset, you can safely ignore this email — your password will not be changed.`;
  return { subject, html, text };
}
