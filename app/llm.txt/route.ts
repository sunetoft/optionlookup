export const dynamic = 'force-static'

export async function GET() {
  const body = `# OptionLookup

> Options wheel strategy analysis tool. Analyze covered calls, cash-secured puts, LEAPS, and call spread opportunities. Freemium: free tier with limited lookups, then subscription.

## Key Pages
- [Home](/) — landing page
- [Dashboard](/dashboard) — main dashboard with search and analysis
- [Account](/account) — user account and subscription management
- [Pricing](/pricing) — subscription plans
- [Login](/login) — sign in
- [Sign Up](/signup) — create account

## API
- [Bookmarks](/api/bookmarks) — manage bookmarked stocks (auth required)
- [History](/api/history) — lookup history (auth required)
- [Stripe Webhooks](/api/stripe) — Stripe webhook endpoint
- [External Import](/api/external/import-stock) — cross-site stock import (auth required)
- [Cron Renewal Reminders](/api/cron/renewal-reminders) — subscription renewal emails

## Links
- [GitHub](https://github.com/sunetoft/optionlookup)
- [Family](https://bunnystocks.com) — Bunnystocks tools ecosystem
`
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
