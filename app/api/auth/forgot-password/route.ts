import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { prisma } from '@/lib/db';
import { sendEmail, forgotPasswordEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const APP_URL = process.env.NEXTAUTH_URL || 'https://optionlookup.bunnystocks.com';

  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.trim() : '';

    if (email) {
      // Only credential users (those with a password) can reset a password.
      // Google-only users have no password set, so skip them.
      const user = await prisma.user.findUnique({ where: { email } });

      if (user && user.password) {
        const token = crypto.randomUUID() + crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await prisma.passwordReset.create({
          data: { token, userId: user.id, expiresAt },
        });

        const resetUrl = `${APP_URL}/reset-password?token=${token}`;
        const { subject, html } = forgotPasswordEmail(resetUrl);
        await sendEmail({
          to: user.email,
          subject,
          html,
          type: 'PASSWORD_RESET',
          userId: user.id,
        });
      }
    }
  } catch (err) {
    console.error('Forgot password error:', err);
  }

  // Always return success to prevent account enumeration.
  return NextResponse.json({ success: true });
}
