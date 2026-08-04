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

### Core
- [Bookmarks](/api/bookmarks) — manage bookmarked stocks (auth required)
- [History](/api/history) — lookup history (auth required)
- [Stripe Webhooks](/api/stripe) — Stripe webhook endpoint
- [External Import](/api/external/import-stock) — cross-site stock import (auth required)
- [Cron Renewal Reminders](/api/cron/renewal-reminders) — subscription renewal emails (cron key auth)
- [Admin Users](/api/admin/users) — user management (admin)
- [Admin Email](/api/admin/email-users) — bulk email (admin)
- [TradeScouter Sync](/api/tradescouter) — cross-site stock sync
- [ThemeInvestor Sync](/api/themeinvestor) — cross-site stock sync

## Links
- [GitHub](https://github.com/sunetoft/optionlookup)
- [Family](https://bunnystocks.com) — Bunnystocks tools ecosystem
`
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
