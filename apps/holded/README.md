# Holded

Lets an agent work with a Holded account: list, read, create, update and delete contacts and
invoices, manage products, list and create expenses, and list purchase orders and treasury
(bank) accounts. It calls the Holded invoicing API (`https://api.holded.com/api/invoicing/v1`)
with an API key.

Limits: the app covers the invoicing API only. `create-invoice` creates the document in Holded;
it does not send it or charge anyone. Lists are paginated by page number. The API key is a system
secret, so every installation of the app works on the same Holded account.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-contacts` | Lists contacts: customers, suppliers and others. | no |
| `get-contact` | Returns one contact. | no |
| `list-invoices` | Lists sales invoices. | no |
| `get-invoice` | Returns one invoice. | no |
| `list-products` | Lists products and services. | no |
| `get-product` | Returns one product. | no |
| `list-expenses` | Lists expense documents. | no |
| `list-purchase-orders` | Lists purchase orders. | no |
| `list-treasury-accounts` | Lists treasury (bank) accounts with their balances. | no |
| `create-contact` | Creates a contact. | yes, asks first |
| `update-contact` | Updates the given fields of a contact. | yes, asks first |
| `delete-contact` | Deletes a contact. | yes, asks first |
| `create-invoice` | Creates an invoice for a contact with at least one line item. | yes, asks first |
| `update-invoice` | Updates the given fields of an invoice. | yes, asks first |
| `delete-invoice` | Deletes an invoice. | yes, asks first |
| `create-product` | Creates a product. | yes, asks first |
| `update-product` | Updates the given fields of a product. | yes, asks first |
| `create-expense` | Creates an expense for a contact with at least one line item. | yes, asks first |

Every tool that writes is marked `sensitive`, so hosts ask before running it. `delete-contact`
and `delete-invoice` are also `destructiveHint: true`.

## Setup

```bash
agentapps install app.holded holded
agentapps config app.holded API_KEY:<your key>
agentapps holded tools
agentapps holded tool list-contacts page:1
```

`API_KEY` is a system secret: one key for every installation of the app. Create it in Holded
under Settings > API. The app reads it from the Station on each call and sends it to Holded as
the `key` query parameter.

## Terms of use

Holded's own terms apply to everything the app does on your behalf:
<https://www.holded.com/tac>. Holded's own API limits apply; this README does not list them.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | the glyph in the header of <https://www.holded.com>, which the page carries inline and not as a file | saved as a file of its own (added `xmlns`, removed the page's `class` and `aria-label`) and painted in `#FF5454`, the red the glyph has in Holded's own logo file (<https://www.holded.com/assets/logos/holded-visma-logo.svg>). Asked for by the project owner. |
| assets/logo-mono.svg | the same glyph | saved as a file of its own: added `xmlns`, removed the page's `class` and `aria-label` |

Holded has no press or brand page (`/press`, `/prensa`, `/brand`, `/press-kit`, `/media-kit` answer 404).
