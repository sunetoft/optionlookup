# CONTEXT.md — OptionLookup Domain Vocabulary

> This file defines the **conceptual domain** of OptionLookup: what each term
> **IS** and **ISN'T**. It complements `AGENTS.md` (which is operational).
> Read this to learn *what the product means*; read AGENTS.md to learn *how to
> run it*.

**Product:** OptionLookup — a Wheel Strategy Analysis tool
**User's trading rule:** every trade must deliver **≥0.1% ROI per trading day on
collateral**, with strikes placed **OUTSIDE the Expected Move**.
**Broker context:** the user trades via Saxo Bank (SaxoTraderGO).

---

## 1. The Strategy: The Wheel

**IS** — A two-phase options income strategy:
1. **Phase 1 (CSP):** Sell Cash-Secured Puts to collect premium. If assigned,
   take ownership of 100 shares per contract at the strike price.
2. **Phase 2 (CC):** Once assigned and holding shares, sell Covered Calls against
   them for more premium. If called away, sell the shares at the call strike and
   restart the cycle.

OptionLookup's core job is **Phase 1 (finding and qualifying Puts)**. The UI and
scanning logic are put-centric. Covered Calls are part of the strategy's
vocabulary but are not scanned by this tool.

**ISN'T** — Directional/speculative trading, day-trading, or buying options.
The user is an *option seller* (premium collector), not a buyer.

---

## 2. Core Option Mechanics

### Option
**IS** — A derivative contract giving the *buyer* the right (not obligation) to
buy (call) or sell (put) 100 shares of the **underlying** at a fixed **strike**
price on a fixed **expiration** date.
**ISN'T** — In this app, options are something the *user sells*, not buys. The
user is the counterparty collecting **premium**.

### Underlying / Ticker
**IS** — The stock symbol the option is written on (e.g. `AAPL`). The app
refers to it as `ticker`. OptionLookup analyzes a single ticker at a time.
**ISN'T** — Not indices, futures, crypto, or forex. Equity single-name only.

### Call
**IS** — The right to BUY shares at the strike. Relevant to Phase 2 (CC).
**ISN'T** — Not scanned here. The scanner only surfaces **puts**.

### Put
**IS** — The right to SELL shares at the strike. The user *sells* puts (CSP),
obligating themselves to buy 100 shares/contract at the strike if assigned.
This is the central instrument OptionLookup qualifies and ranks.
**ISN'T** — Not a directional bet that price will fall. Selling a put is a
*bullish-to-neutral* income trade.

### Strike (Strike Price)
**IS** — The fixed price per share at which a put can be exercised. For a
CSP, the strike is also the **assignment price** (what you'd pay per share if
assigned) and the basis for **collateral** (strike × 100).
**ISN'T** — Not the option's price (that's the **premium**).

### Premium
**IS** — The cash the put *buyer* pays the *seller* (the user). Quoted as
**bid / ask**; the app uses the **bid** as the realizable premium for selling.
**ISN'T** — Not profit yet. It's gross income; the trade isn't "won" until
expiry without assignment.

### Collateral
**IS** — Cash reserved to fulfill the put obligation = **strike × 100** (for a
single contract). All ROI math in this app is expressed *relative to
collateral*, NOT relative to share count or premium alone.
**ISN'T** — Not the option's cost. Selling a put *generates* cash; collateral is
the reserve that backs the obligation.

### Expiration / Expiry
**IS** — The date the option contract ceases to exist and is settled.
OptionLookup always uses **expirations BEFORE the next earnings date** when one
is known, to avoid holding a put through an earnings event.
**ISN'T** — Not arbitrary. Earnings expirations are explicitly filtered OUT.

### DTE (Days to Expiration)
**IS** — Calendar days from now to expiration: `ceil((expiry − today)/1d)`.
The denominator in **ROI per day**.
**ISN'T** — Not trading days. Despite the user's "ROI per *trading* day" rule,
the code uses calendar days for the math.

### Assignment
**IS** — Being forced to buy the underlying at the strike because the put
finished in-the-money (price < strike) at expiry. Modeled probabilistically as
**P(assignment)** by TimesFM.
**ISN'T** — Not a loss. In the wheel, assignment is the *intended* mechanism for
acquiring shares to then write covered calls against.

### Breakeven
**IS** — `strike − premium`. The underlying price at which the put sale nets
zero (below it, the position is unprofitable on a mark-to-market basis).
**ISN'T** — Not the strike, and not the premium.

### Moneyness: ATM / ITM / OTM
- **ATM (At-The-Money):** strike ≈ current price. Used for the **straddle** that
  derives the Expected Move.
- **OTM (Out-of-The-Money):** strike **below** current price (for a put). This is
  where CSPs are sold for income with lower assignment risk.
- **ITM (In-The-Money):** strike **above** current price (for a put) → high
  assignment probability. The scanner filters these OUT.

---

## 3. Market Data & Pricing

### Option Chain
**IS** — The full set of option contracts for a ticker across all strikes and
expirations. OptionLookup walks the chain by expiration, filtering strikes.
**ISN'T** — Not a single quote. It's a 2-D grid (strike × expiry).

### Bid / Ask / Last
**IS** — `bid` = best price a seller can get now; `ask` = best price a buyer
pays; `lastPrice` = most recent trade. The scanner uses **bid** as the premium
(it's what a seller realistically receives).
**ISN'T** — The ask is *not* used as premium; using it would overstate returns.

### Volume & Open Interest (OI)
**IS** — `volume` = contracts traded today; `openInterest` = contracts currently
open. Both are surfaced per put as liquidity context.
**ISN'T** — Not part of the qualification *rules*. A put can qualify with zero
volume/OI; these are informational only.

### Implied Volatility (IV)
**IS** — The market's forward-looking volatility expectation, back-solved from
option prices. Surfaced per put and shown as a percentage.
**ISN'T** — Not historical/realized volatility, and not a trade signal by itself.

### Greeks
**IS** — In general options theory: delta, gamma, theta, vega, rho + IV.
**ISN'T** — *In this app*, effectively **only IV**. The code pulls
`greeks.impliedVolatility` and ignores delta/gamma/theta/vega/rho. Don't expect
Greek-based logic or display beyond IV.

---

## 4. Expected Move (EM) — the Safety Concept

The user's hard rule is that strikes must sit **outside** the Expected Move.
The EM defines the "stay away from here" zone.

### Expected Move
**IS** — The market-implied ± price range the underlying is expected to stay
within by a given expiration. OptionLookup derives it from the **ATM straddle**:
`expectedMove = straddle × 0.85`.
**ISN'T** — Not a forecast of where price *will* go. It's a pricing-derived
probability band.

### ATM Straddle
**IS** — `ATM call price + ATM put price` (same expiry). The raw input to the
options-implied Expected Move.
**ISN'T** — Not the EM itself (multiply by 0.85 first).

### Upper Bound / Lower Bound
**IS** — `upperBound = currentPrice + expectedMove`,
`lowerBound = currentPrice − expectedMove`.
The **lowerBound is the critical threshold**: a CSP strike must be **≤ lowerBound**
to qualify (outside the EM on the downside).
**ISN'T** — The upper bound is informational for puts; it matters for covered
calls (Phase 2), which this tool doesn't scan.

### EM Source
**IS** — A tag on each qualified put: `'options'` (derived from ATM straddle) or
`'timesfm'` (derived from the ML model). Drives the badge color in the table.
**ISN'T** — Not a data-source (Yahoo/Alpaca) tag; that's a separate concept.

---

## 5. TimesFM — the ML Forecast Layer

### TimesFM
**IS** — A local forecasting sidecar (`timesfm-2.5-200m`) at `localhost:3014`
that produces a probabilistic price distribution per ticker up to a 45-day
horizon. It enriches the options-only analysis with a second, model-based view.
**ISN'T** — Not required. If unavailable, the app **gracefully degrades** to
options-only EM and skips model scoring entirely.

### Quantiles (p10…p90)
**IS** — The model's predicted price at the 10th…90th percentile of its
distribution, per horizon step. `p50` ≈ median forecast. Used to derive a
**model EM** = `(p90 − p10) / 2`.
**ISN'T** — Not confidence intervals in the frequentist sense; they're quantiles
of the model's predictive distribution.

### P(assignment) / P(profit)
**IS** — Probabilities derived by **interpolating the quantile CDF** at the
put's strike (P price ≤ strike = P(assignment)) and breakeven (P price >
breakeven = P(profit)).
**ISN'T** — Not from Black-Scholes delta. They come from the TimesFM
distribution, not options pricing.

### Risk-Adjusted ROI
**IS** — `ROI/day × P(profit)`. The per-day return penalized by the chance the
trade doesn't pan out.
**ISN'T** — Not the same as raw ROI/day; it's always lower.

### Model Score
**IS** — `ROI/day × P(profit) × (1 − P(assignment))`. The single ranking key for
the "TimesFM Model Top Picks" — higher = better risk-adjusted return.
**ISN'T** — Not the default sort of the full table (that's ROI/day). It only
orders the top-5 model picks.

### EM Verdict (Dual-EM validation)
**IS** — A comparison of options-implied EM vs TimesFM model EM, one of:
- **`agreement`** — EMs agree within 10%.
- **`model_wider`** — "Risk Underpriced": model range is wider → options may be
  underpricing downside risk.
- **`options_richer`** — "Premium Rich": options EM is wider → good for sellers.
- **`neutral`** — no options EM available to compare.
**ISN'T** — Not a buy/sell recommendation. It's a divergence indicator.

---

## 6. The Qualification Rules (what makes a "Qualified Put")

A put is **qualified** ONLY if it passes ALL of these gates
(see `app/api/stock/options/route.ts`):

1. **Strike ≥ 50% of current price** — drops deep-distress far-OTM junk.
2. **Bid > 0** — there must be a market / realizable premium.
3. **ROI/day > 0.09%** — enforces the user's ≥0.1%/day rule (0.09 threshold
   leaves rounding headroom).
4. **Strike ≤ Expected Move lower bound** — the strike sits OUTSIDE the EM.
5. **Expiration before earnings** — when an earnings date is known and future.

**ROI per day** = `(bid / strike / DTE) × 100` — premium as a fraction of
**collateral** (strike), annualized-per-day. This is the formula, not
premium/price.

**Total ROI** = `(bid / strike) × 100` — same basis, not annualized.

---

## 7. Technical Warnings (entry safety checks)

Surfaced in the Warnings Card; each is `safe` (✓) or not (⚠):

| Warning | Meaning | "Safe" threshold |
|---|---|---|
| **Earnings Date** | Days until next earnings (puts must expire before) | unknown or > 30 days |
| **EMA 21 Deviation** | `%` price is above the 21-day Exponential Moving Average | ≤ +5% (avoid buying tops) |
| **RSI (14)** | 14-period Relative Strength Index | ≤ 50 (not overbought) |
| **Monthly Range** | Where price sits within the last 30-day high/low band, % | ≤ 70% (not at recent top) |

**ISN'T** — These are *filters of caution*, not part of the hard put-qualification
rules. A put can qualify while a warning is red.

### Fundamentals (informational)
**P/E**, **P/S**, **EPS Growth**, **Market Cap**, **52W High/Low**, **Volume**,
**Prev Close**, **Change %** — standard equity metrics shown for context. They
do **not** gate qualification.

---

## 8. App-Level Vocabulary

### Lookup
**IS** — One full analysis run for a ticker (analyze + options scan counts as a
single logical lookup). Rate-limited for anonymous/non-subscribed users.

### Bookmark
**IS** — A saved `ticker` per user (`Bookmark` model). A watchlist of tickers,
not a saved analysis.

### Imported Stock
**IS** — A ticker pushed into OptionLookup from **TradeScouter**
(`localhost:3013`) via the cross-site import API, scoped per user.

### Analysis History
**IS** — A stored snapshot of a completed analysis (`AnalysisHistory.data`,
JSON). History of *what was analyzed*, keyed by ticker.

### Data Sources
- **Yahoo Finance** — primary source for quotes, history, options chains.
- **Alpaca** — automatic **failover** when Yahoo rate-limits (429) or fails.
Both sources backfill the same fields; the UI tags which one was used (`dataSource`).

---

## 9. Users, Access & Subscriptions

### Roles
- **FREE** — default; rate-limited.
- **PAID** — has an active subscription; unlimited lookups.
- **ADMIN** — elevated (not used for any domain logic in the scan).

### Subscription Tier
**IS** — A time-limited access grant: `MONTHLY` (30d), `QUARTERLY` (90d),
`SEMI_ANNUAL` (180d), `ANNUAL` (360d). Each maps to a Stripe price ID.
**Statuses:** `ACTIVE`, `TRIALING`, `CANCELED`, `PAST_DUE`.
**ISN'T** — Not a feature-gating tier (all tiers unlock the same scanner).

### Anonymous Lookups & Quarantine
**IS** — Unauthenticated users get **5 free lookups (by UNIQUE ticker)**, then a
**5-day quarantine** keyed by client IP/fingerprint. Quarantine expiry resets the
counter.
**ISN'T** — Not a hard paywall before signup; it's a metered trial.

---

## 10. Cross-App Context

| App | Port | Relationship to OptionLookup |
|---|---|---|
| **OptionLookup** | 3011 | This app (wheel put scanner). |
| **TradeScouter** | 3013 | Pushes stock *imports* and syncs status. |
| **TimesFM sidecar** | 3014 | ML price-distribution forecasts for EM/scoring. |
| **ThemeValidator** | 3001 | Status sync only. |

All cross-site calls authenticate via the shared `CROSS_SITE_API_KEY` secret.

---

### Quick formula cheat-sheet
```
ROI/day        = (bid / strike / DTE) × 100
Total ROI      = (bid / strike) × 100
Expected Move  = ATM straddle × 0.85
lowerBound     = currentPrice − expectedMove
breakeven      = strike − bid
riskAdjustedROI= ROI/day × P(profit)
modelScore     = ROI/day × P(profit) × (1 − P(assignment))
model EM       = (p90 − p10) / 2
```
