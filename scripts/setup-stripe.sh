#!/bin/bash
# OptionLookup Stripe Setup Script
# Run this after adding your STRIPE_SECRET_KEY to .env
# Usage: source .env && bash scripts/setup-stripe.sh

set -e

STRIPE_KEY="${STRIPE_SECRET_KEY}"
if [[ "$STRIPE_KEY" == *"__ADD"* ]] || [[ -z "$STRIPE_KEY" ]] || [[ "$STRIPE_KEY" == "***" ]]; then
  echo "❌ STRIPE_SECRET_KEY not set. Add it to .env first."
  exit 1
fi

export STRIPE_API_KEY="$STRIPE_KEY"

echo "🔧 Creating Stripe products and prices..."

# Create product
PRODUCT=$(stripe products create --name="OptionLookup Membership" --description="Unlimited wheel strategy analysis" 2>/dev/null)
PRODUCT_ID=$(echo "$PRODUCT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "  Product: $PRODUCT_ID"

# Create 4 recurring prices
declare -A DURATIONS=( ["MONTHLY"]=30 ["QUARTERLY"]=90 ["SEMI_ANNUAL"]=180 ["ANNUAL"]=360 )
declare -A PRICES=( ["MONTHLY"]=1000 ["QUARTERLY"]=2500 ["SEMI_ANNUAL"]=4500 ["ANNUAL"]=8000 )
declare -A NICKNAMES=( ["MONTHLY"]="optionlookup-monthly" ["QUARTERLY"]="optionlookup-quarterly" ["SEMI_ANNUAL"]="optionlookup-semi-annual" ["ANNUAL"]="optionlookup-annual" )

echo "" > /tmp/optionlookup-stripe-price-ids.txt

for TIER in MONTHLY QUARTERLY SEMI_ANNUAL ANNUAL; do
  PRICE=$(stripe prices create \
    --product="$PRODUCT_ID" \
    --unit-amount="${PRICES[$TIER]}" \
    --currency=usd \
    --recurring-interval=day \
    --recurring-interval-count="${DURATIONS[$TIER]}" \
    --nickname="${NICKNAMES[$TIER]}" \
    2>/dev/null)
  
  PRICE_ID=$(echo "$PRICE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  echo "  $TIER: $PRICE_ID (${DURATIONS[$TIER]} days, \$${PRICES[$TIER]/100})"
  echo "export STRIPE_PRICE_${TIER}=\"${PRICE_ID}\"" >> /tmp/optionlookup-stripe-price-ids.txt
done

echo ""
echo "✅ All prices created!"
echo ""
echo "📋 Add these to your lib/subscription.ts stripePriceId fields:"
cat /tmp/optionlookup-stripe-price-ids.txt
echo ""
echo "Next: Set up webhook with 'stripe listen --forward-to localhost:3099/api/stripe/webhook'"
