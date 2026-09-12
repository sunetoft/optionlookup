export const dynamic = 'force-static'

export async function GET() {
  const body = `# OptionLookup

> Options wheel strategy analysis tool. Analyze covered calls, cash-secured puts, LEAPS, and call spread opportunities. Includes a multi-tenant CSP Scanner that finds cash-secured puts meeting ROI/price-target rules across user watchlists. Freemium: free tier with limited lookups, then subscription.

## Key Pages
- [Home](/) — landing page
- [Dashboard](/dashboard) — main dashboard with search and on-demand analysis
- [Scanner](/scanner) — CSP Scanner dashboard: watchlists of tickers with USD price targets; qualified cash-secured put contracts with ROI/day, DTE, implied volatility, and earnings warnings
- [Scanner Heatmap](/scanner/heatmap) — admin-only market heatmap of the best CSP contracts across all users
- [Account](/account) — user account and subscription management
- [Pricing](/pricing) — subscription plans
- [Login](/login) — sign in
- [Sign Up](/signup) — create account
- [Reset Password](/reset-password) — password reset

## API

### Scanner (CSP Scanner)
- [Scanner Tickers](/api/scanner/tickers) — GET/POST/DELETE/PATCH user scanner watchlist with latest results (auth required)
- [Scanner Scan](/api/scanner/scan) — POST; manual "Scan Now" for a ticker (auth required)
- [Scanner Cron](/api/scanner/cron) — POST; scheduled scan for all users (x-api-key auth)
- [Scanner Heatmap](/api/scanner/heatmap) — GET; admin-only aggregate best contracts (auth required)
- [Scanner Categories](/api/scanner/categories) — GET/POST; user ticker categories (auth required)

### Auth
- [NextAuth](/api/auth/[...nextauth]) — NextAuth.js handler (Google OAuth + credentials)
- [Sign Up](/api/signup) — register a new user account
- [Forgot Password](/api/auth/forgot-password) — request password reset email
- [Reset Password](/api/auth/reset-password) — reset password with token

### Analysis & Core
- [Stock Analyze](/api/stock/analyze) — on-demand wheel strategy analysis (auth required)
- [Stock Options](/api/stock/options) — fetch option chain for a ticker (auth required)
- [Bookmarks](/api/bookmarks) — manage bookmarked stocks (auth required)
- [History](/api/history) — lookup history (auth required)

### Subscription
- [Access](/api/subscription/access) — check subscription access (auth required)
- [Status](/api/subscription/status) — get subscription status (auth required)
- [Cancel](/api/subscription/cancel) — cancel subscription (auth required)

### Stripe
- [Checkout](/api/stripe/checkout) — create Stripe checkout session (auth required)
- [Portal](/api/stripe/portal) — Stripe customer billing portal (auth required)
- [Webhook](/api/stripe/webhook) — Stripe webhook endpoint (signature verified)

### External & Cron
- [External Import](/api/external/import-stock) — cross-site stock import (auth required)
- [External User Exists](/api/external/user-exists) — check if a user account exists for an email
- [Cron Renewal Reminders](/api/cron/renewal-reminders) — subscription renewal emails (cron key auth)
- [TradeScouter Sync](/api/tradescouter/status) — cross-site stock sync (status + stocks)
- [ThemeInvestor Sync](/api/themeinvestor/status) — cross-site stock sync (status + stocks)

## Links
- [GitHub](https://github.com/sunetoft/optionlookup)
- [Family](https://bunnystocks.com) — Bunnystocks tools ecosystem
`
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
