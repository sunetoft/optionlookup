# AGENTS.md — OptionLookup

> **Product name:** OptionLookup
> **Domain:** `optionlookup.bunnystocks.com`
> **GitHub:** `sunetoft/optionlookup` (private)
> **Local path:** `/Users/sune/projects/optionlookup`

## What This App Does

Wheel Strategy Analysis tool — helps options traders find, analyze, and track
Cash-Secured Puts (CSP) and Covered Calls (CC). Calculates expected move,
ROI per day on collateral, and filters strikes that meet the user's hard
rules. Supports stock import from TradeScouter and bookmarking analyses.

The user trades the wheel strategy via Saxo Bank (SaxoTraderGO) with strict
rules: every trade must deliver ≥0.1% ROI per trading day on collateral,
and strikes must be OUTSIDE the Expected Move.

## Tech Stack

- **Framework:** Next.js 14+ App Router, TypeScript, Tailwind CSS (Turbopack dev)
- **Database:** SQLite via Prisma ORM
- **Auth:** NextAuth.js (Google OAuth + credentials, Prisma adapter)
- **Payments:** Stripe subscriptions
- **Market Data:** Alpaca API
- **Email:** Gmail SMTP
- **UI:** Radix UI primitives, Lucide icons, next-themes

## Environment Variables

| Key | Purpose |
|-----|---------|
| `DATABASE_URL` | SQLite path, e.g. `file:./dev.db` |
| `NEXTAUTH_SECRET` | NextAuth session secret |
| `NEXTAUTH_URL` | `https://optionlookup.bunnystocks.com` |
| `ALPACA_API_KEY` / `ALPACA_API_SECRET` | Alpaca market data |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe payments |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Email sending |
| `CRON_API_KEY` | Auth token for cron endpoints |
| `CROSS_SITE_API_KEY` | Shared secret for inter-app API calls |
| `TRADESCOUTER_INTERNAL_URL` | `http://localhost:3013` |

## Database

```bash
npx prisma generate      # generate client (also runs on postinstall)
npx prisma db push       # sync schema
```

**Models:** User, Account, Session, VerificationToken, ImportedStock,
Bookmark, AnalysisHistory, Subscription, AnonymousUsage, EmailLog,
PasswordReset

## Build & Deploy

```bash
cd /Users/sune/projects/optionlookup
npm install
npm run build
```

**Port:** 3011 (set in launchd plist, not in `npm start`)

### Production Deploy (macOS launchd)

```bash
# 1. Build
cd /Users/sune/projects/optionlookup && npm run build

# 2. Restart launchd service (CRITICAL)
launchctl unload ~/Library/LaunchAgents/com.stdigital.optionlookup.plist
launchctl load ~/Library/LaunchAgents/com.stdigital.optionlookup.plist

# 3. Verify
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3011/
curl -s -o /dev/null -w "%{http_code}" "https://optionlookup.bunnystocks.com/?nocache=$(date +%s)"
```

> **#1 Gotcha:** After `npm run build`, you MUST restart the launchd service.
> Old HTML references stale webpack JS chunk hashes → 404 → page looks broken.

### Cloudflare Cache

Cannot purge CF cache via API. Always use `?nocache=TIMESTAMP` for verification.

## Directory Structure

```
app/                    Next.js App Router
  api/                  API routes (auth, external, tradescouter, cron, etc.)
  dashboard/            Main analysis dashboard
  account/              User account settings
  pricing/              Stripe pricing page
  login/ / signup/      Auth pages
components/             React components (Radix UI, dashboard widgets)
lib/                    Shared utilities (auth, db, email, market data, etc.)
prisma/                 Prisma schema + migrations
scripts/                Maintenance scripts
types/                  TypeScript type definitions
```

## Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| Renewal reminders (Hermes cron) | 09:00 GMT+2 daily | Sends subscription renewal reminders |

## Cross-App Dependencies

- **TradeScouter** (`localhost:3013`): Receives stock imports, status sync
- **ThemeValidator** (`localhost:3001`): Status sync
- All cross-site calls authenticated via `CROSS_SITE_API_KEY` shared secret
