/**
 * instrumentation.ts — Next.js 15 startup hook (runs in the next-server process).
 *
 * Fixes macOS broken IPv6, which otherwise breaks Google OAuth server-side:
 * Node resolves dual-stack hosts (oauth2.googleapis.com, accounts.google.com)
 * to IPv6 FIRST and hangs on the token exchange during OAuth callbacks ->
 * "AggregateError: internalConnectMultiple" / ETIMEDOUT. Force IPv4 before any
 * HTTP clients or auth libs initialize.
 *
 * ALSO guards against silent OAuth breakage from placeholder/corrupted
 * NEXTAUTH_URL env values (a placeholder like `https://....com` gets sent to
 * Google and rejected with "invalid_request").
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const dns = await import('dns');
    dns.setDefaultResultOrder('ipv4first');
    // eslint-disable-next-line no-console
    console.log('[instrumentation] DNS result order set to ipv4first');

    const issues: string[] = [];

    // --- NEXTAUTH_URL validation ---
    const nad = process.env.NEXTAUTH_URL;
    if (!nad) {
      issues.push("NEXTAUTH_URL is not set");
    } else {
      let ok = true;
      try {
        new URL(nad);
      } catch {
        ok = false;
        issues.push(`NEXTAUTH_URL is not a valid URL: "${mask(nad)}"`);
      }
      if (/\.{3,}/.test(nad) || /^\*+$/.test(nad) || nad.includes("***")) {
        ok = false;
        issues.push(
          `NEXTAUTH_URL looks like a placeholder/corrupted value: "${mask(nad)}". ` +
          `Set it to the real production domain or Google OAuth will reject logins.`
        );
      }
      if (ok && !/^https?:\/\//.test(nad)) {
        ok = false;
        issues.push(`NEXTAUTH_URL must start with http(s):// : "${mask(nad)}"`);
      }
      if (ok) {
        const host = new URL(nad).host;
        if (!host.includes(".") || host.startsWith("....") || host.includes("....")) {
          ok = false;
          issues.push(`NEXTAUTH_URL host looks corrupted: "${host}"`);
        }
      }
    }

    // --- Google OAuth creds validation ---
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      issues.push("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing");
    }

    const expectedCallback = `${process.env.NEXTAUTH_URL ?? "(unset)"}/api/auth/callback/google`;

    if (issues.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        "\n============================================================\n" +
        "[instrumentation] ❌ OAuth CONFIG PROBLEMS DETECTED — Google login WILL break:\n" +
        "  " + issues.join("\n  ") + "\n" +
        `  current callback: ${mask(expectedCallback)}\n` +
        "============================================================\n"
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        "[instrumentation] ✅ OAuth config OK — " +
        `callback ${mask(expectedCallback)} | google client set`
      );
    }
  }
}

function mask(v: string): string {
  try {
    const u = new URL(v);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    const t = v.trim();
    return t.length > 24 ? t.slice(0, 10) + "…" + t.slice(-8) : t;
  }
}
