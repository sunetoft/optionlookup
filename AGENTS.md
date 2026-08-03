# AGENTS.md — OptionLookup

> **Product name:** OptionLookup
> **Domain:** `optionlookup.bunnystocks.com`
> **GitHub:** `sunetoft/optionlookup` (private)
> **Local path:** `/Users/sune/projects/optionlookup`

## What This App Does

Wheel Strategy Analysis tool — helps options traders find, analyze, and track
Cash-Secured Puts (CSP) and Covered Calls (CC). Calculates expected move,
ROI per day on collateral, and filters strikes that meet the user's hard
rules. Supports stock import from TradeScouter and Themeinvestor, plus bookmarking
analyses.

**CSP Scanner** (added Aug 2026): Multi-tenant scanner where users create
ticker watchlists with USD price targets. A scheduled cron (2× daily during
NYSE hours) scans option chains for CSP puts with ROI ≥ 0.1%/day, strike ≤
user target, DTE ~30-60 (loose). Results replace on each scan. Discord
notifications + email digests sent after each scan. Admin heatmap shows
best CSP opportunities across all users.

The user trades the wheel strategy via Saxo Bank (SaxoTraderGO) with strict
rules: every trade must deliver ≥0.1% ROI per trading day on collateral,
and strikes must be OUTSIDE the Expected Move.

## Tech Stack

- **Framework:** Next.js 14+ App Router, TypeScript, Tailwind CSS (Turbopack dev)
- **Database:** SQLite via Prisma ORM
- **Auth:** NextAuth.js (Google OAuth + credentials, Prisma adapter)
- **Payments:** Stripe subscriptions
- **Market Data:** Yahoo Finance (primary) + Alpaca API (failover)
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
| `THEMEVALIDATOR_INTERNAL_URL` | `http://localhost:3001` |
| `SCANNER_DISCORD_WEBHOOK_URL` | Discord webhook for CSP scanner notifications (optional — if unset, Discord notifications silently skipped) |

## Database

```bash
npx prisma generate      # generate client (also runs on postinstall)
npx prisma db push       # sync schema
```

**Models:** User, Account, Session, VerificationToken, ImportedStock,
Bookmark, AnalysisHistory, Subscription, AnonymousUsage, EmailLog,
PasswordReset, ScanCategory, ScanTicker, ScanResult, ScanRun

### CSP Scanner Models (Aug 2026)

- **ScanTicker**: User watchlist entry (`userId`, `ticker`, `priceTarget`). Unique on `[userId, ticker]`.
- **ScanResult**: Individual qualifying contract from a scan (`scanTickerId`, `scanRunId`, `strike`, `expiration`, `dte`, `bid`, `ask`, `roiPerDay`, `totalRoi`, `openInterest`, `volume`, `impliedVol`, `earningsWarning`, `emWarning`).
- **ScanRun**: Metadata for a single scan execution (`scanTickerId`, `userId`, `ticker`, `scanType` = "scheduled" | "manual", `totalPuts`, `qualifiedPuts`, `currentPrice`, `earningsDate`).

Old results are deleted and replaced on each scan (Option A replacement).

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
  api/                  API routes
    scanner/            CSP Scanner API (Aug 2026)
      scan/route.ts     POST — manual "Scan Now" per ticker
      cron/route.ts     POST — scheduled scan for ALL users (x-api-key auth)
      tickers/route.ts  GET/POST/DELETE — user watchlist CRUD
      heatmap/route.ts  GET — admin-only aggregate heatmap data
  scanner/              CSP Scanner pages
    page.tsx            User scanner dashboard
    heatmap/page.tsx    Admin heatmap dashboard
  dashboard/            Main on-demand analysis dashboard
  account/              User account settings
  pricing/              Stripe pricing page
  login/ / signup/      Auth pages
components/
  scanner/              CSP Scanner UI components
    scanner-dashboard.tsx   Main scanner page (watchlist + contracts)
    add-ticker-form.tsx     Ticker + price target input form
    ticker-row.tsx          Expandable row: contracts table + ROI sparkline
    heatmap-dashboard.tsx   Admin market heatmap (all users' best contracts)
  dashboard/            Analysis widgets (fundamentals, warnings, insights, expected moves, chart, options)
lib/
  scanner-engine.ts     Reusable CSP scanning logic (Yahoo→Alpaca, price target filter, ROI/EM/earnings warnings)
  scanner-notifications.ts  Discord webhook + email digest
  auth.ts, db.ts, email.ts, subscription.ts, alpaca-client.ts, stock-utils.ts
prisma/                 Prisma schema + migrations
scripts/                Maintenance scripts
types/                  TypeScript type definitions
```

## Dashboard Analysis Components

The dashboard renders a vertical stack of analysis cards when a ticker is looked up:

1. **FundamentalsCard** — Price, P/E, P/S, EPS growth, market cap, volume, 52W range
2. **WarningsCard** — Technical warnings (earnings proximity, EMA21 deviation, RSI, monthly range)
3. **TickerInsightsCard** — 4-tile visual insights grid
4. **ExpectedMovesCard** — Options-implied EM (0.85×ATM straddle) + TimesFM model EM comparison
5. **PriceChart** — 6-month price history with EMA21 overlay and EM bands
6. **OptionsTable** — Scans all option chains for qualifying puts

## CSP Scanner Section (Aug 2026)

### Overview

Multi-tenant scanner at `/scanner`. Users add tickers with USD price targets.
Scanner runs 2× daily during NYSE hours and finds CSP puts matching:
- ROI ≥ 0.1% per trading day
- Strike ≤ user's price target
- DTE ~30-60 (loose — contracts outside range shown with badge)
- EM as warning indicator (not a hard filter)
- Earnings warning if contract expires after next earnings date

### Scanner API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/scanner/tickers` | GET | Session | Get user's watchlist with latest results + scan history |
| `/api/scanner/tickers` | POST | Session | Add ticker `{ ticker, priceTarget }` (respects tier limit) |
| `/api/scanner/tickers` | DELETE | Session | Remove ticker `{ ticker }` |
| `/api/scanner/tickers` | PATCH | Session | Update ticker's category `{ ticker, categoryId }` |
| `/api/scanner/scan` | POST | Session | Manual "Scan Now" `{ ticker }` — runs scan, replaces results |
| `/api/scanner/cron` | POST | `x-api-key` | Scheduled scan for ALL users (cron job) |
| `/api/scanner/heatmap` | GET | Admin | Aggregate best CSP contracts across all users |
| `/api/scanner/categories` | GET | Session | List user's categories with ticker counts |
| `/api/scanner/categories` | POST | Session | Create category `{ name, color }` OR batch-assign `{ action: 'batch-assign', categoryId, tickers }` |
| `/api/scanner/categories` | PUT | Session | Update category `{ id, name?, color? }` |
| `/api/scanner/categories` | DELETE | Session | Delete category `{ id }` — tickers become uncategorized |

### Scanner Tier Limits

| Tier | Ticker Limit |
|------|-------------|
| Free | 3 tickers |
| Paid (active subscription) | Unlimited |
| Admin (`sune@stdigital.dk`) | Unlimited |

Enforced via `canAddScannerTicker()` in `lib/subscription.ts`.

### Scanner Engine (`lib/scanner-engine.ts`)

`scanTickerForCSP(ticker, priceTarget)` → returns `{ contracts, currentPrice, earningsDate, stats }`.

Flow: Yahoo quote (price + earnings) → Yahoo options scan (per-expiration puts) → Alpaca failover.
Filters: bid > 0, strike ≤ priceTarget, ROI ≥ 0.1%/day. EM calculated per-expiration for warning only.

### Scanner Notifications (`lib/scanner-notifications.ts`)

- **Discord webhook**: Rich embed with per-ticker contract summaries. Uses `SCANNER_DISCORD_WEBHOOK_URL` env var. Silently skipped if unset.
- **Email digest**: Per-user HTML email with contract tables. Uses existing Gmail SMTP (`lib/email.ts`). Logged as `SCANNER_DIGEST` type in `EmailLog`.

## Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| Renewal reminders (Hermes cron) | 09:00 GMT+2 daily | Sends subscription renewal reminders |
| CSP Scanner morning (Hermes cron) | 16:00 GMT+2 Mon-Fri (10:00 ET) | Scans all users' tickers — 30 min after NYSE open |
| CSP Scanner afternoon (Hermes cron) | 21:00 GMT+2 Mon-Fri (15:00 ET) | Scans all users' tickers — 60 min before NYSE close |

Scanner cron jobs POST to `https://optionlookup.bunnystocks.com/api/scanner/cron` with `x-api-key` header.

## Cross-App Dependencies

- **TradeScouter** (`localhost:3013`): Receives stock imports, status sync
- **ThemeValidator / Themeinvestor** (`localhost:3001`): Receives stock imports, status sync
- All cross-site calls authenticated via `CROSS_SITE_API_KEY` shared secret

### Imported Stocks (per-source)

Stocks imported from external apps are stored in the `ImportedStock` model,
tagged by `source` (`"tradescouter"` or `"themeinvestor"`). Each source has a
parallel pair of internal API routes powering its dashboard card:

| Source | Status check | Stock list/delete |
|--------|--------------|-------------------|
| TradeScouter | `GET /api/tradescouter/status` | `GET`/`DELETE /api/tradescouter/stocks` |
| Themeinvestor | `GET /api/themeinvestor/status` | `GET`/`DELETE /api/themeinvestor/stocks` |

External apps push/remove imports via the shared cross-site endpoint
`POST`/`DELETE /api/external/import-stock` (pass `source` in the body).
