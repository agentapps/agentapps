# Stripe

Lets an agent work with a Stripe account through the Stripe API (`https://api.stripe.com/v1`):
read customers, payment intents, charges, invoices, subscriptions, products, prices, payouts and
the balance, and create customers, products, prices, payment links, checkout sessions and
refunds. It uses one secret key for every installation, so every installation acts on the same
Stripe account. Requests are not retried.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-customers` | Lists customers, optionally filtered by email, with cursor pagination. | no |
| `get-customer` | Returns one customer by id. | no |
| `create-customer` | Creates a customer. | yes, asks first |
| `list-payments` | Lists payment intents, optionally filtered by customer and status. | no |
| `get-payment` | Returns one payment intent by id. | no |
| `list-invoices` | Lists invoices, optionally filtered by customer and status. | no |
| `get-invoice` | Returns one invoice by id. | no |
| `get-balance` | Returns the account's available and pending balance by currency. | no |
| `list-subscriptions` | Lists subscriptions, optionally filtered by customer and status. | no |
| `get-subscription` | Returns one subscription by id. | no |
| `cancel-subscription` | Cancels a subscription, by default at the end of the current billing period. | yes, asks first |
| `create-payment-link` | Creates a payment link and returns its URL. | yes, asks first |
| `list-products` | Lists products, optionally only active ones. | no |
| `create-product` | Creates a product. | yes, asks first |
| `list-prices` | Lists prices, optionally filtered by product and active status. | no |
| `create-price` | Creates a one-time or recurring price for an existing product. | yes, asks first |
| `list-charges` | Lists charges, optionally filtered by customer and payment intent. | no |
| `create-refund` | Refunds a charge or a payment intent, in full or for a given amount. | yes, asks first |
| `create-checkout-session` | Creates a Checkout session and returns the URL where the customer pays. | yes, asks first |
| `list-payouts` | Lists payouts, optionally filtered by status. | no |

## Setup

```bash
agentapps install app.stripe stripe
agentapps config app.stripe API_KEY:<your secret key>
agentapps stripe tools
agentapps stripe tool list-customers limit:5
```

`API_KEY` is a system secret: one key for every installation of the app. It is a Stripe secret
key (`sk_test_...` or `sk_live_...`) from the Stripe Dashboard, under Developers, API keys
(<https://dashboard.stripe.com/apikeys>). Use a test-mode key to try the app: with a live key,
`create-refund` moves real money.

## Terms of use

Stripe's own terms apply to everything the app does on your behalf, starting with the Stripe
Services Agreement: <https://stripe.com/legal/ssa>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Stripe's press
kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
