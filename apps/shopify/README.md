# Shopify

Lets an agent manage one Shopify store: products, orders, customers, collections, inventory,
pages, discounts, fulfillments and webhooks. It uses the Shopify Admin REST API, version
2024-01, at `https://{shop}.myshopify.com/admin/api/2024-01`, with an Admin API access token.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-products` | Lists products, optionally by title or collection (20 by default). | no |
| `get-product` | Returns one product by id. | no |
| `create-product` | Creates a product. | yes, asks first |
| `update-product` | Changes a product's title, description, vendor, type or tags. | yes, asks first |
| `delete-product` | Deletes a product. It cannot be undone. | yes, asks first |
| `list-orders` | Lists orders, optionally by status, financial status or fulfillment status. | no |
| `get-order` | Returns one order by id. | no |
| `update-order` | Changes an order's note, tags or email. | yes, asks first |
| `list-customers` | Lists customers. | no |
| `get-customer` | Returns one customer by id. | no |
| `get-shop` | Returns the store's name, domain, plan and settings. | no |
| `list-collections` | Lists custom and smart collections. | no |
| `create-fulfillment` | Marks an order's items as shipped, with optional tracking, and can notify the customer. | yes, asks first |
| `list-inventory-items` | Returns inventory items by id, with stock and cost information. | no |
| `update-inventory-level` | Sets the available quantity of an item at a location. | yes, asks first |
| `create-discount` | Creates a price rule: a percentage or a fixed amount. | yes, asks first |
| `list-pages` | Lists the store's pages. | no |
| `list-webhooks` | Lists the store's webhook subscriptions. | no |
| `create-webhook` | Subscribes an address to a store event. | yes, asks first |

Limits:

- The token's Admin API scopes decide what works: a tool fails when its scope is missing.
- The app cannot cancel or refund an order, and cannot delete a webhook or a discount.

## Setup

```bash
agentapps install app.shopify shopify
agentapps config shopify SHOP_DOMAIN:<your-store> ACCESS_TOKEN:<Admin API access token>
agentapps shopify tools
agentapps shopify tool list-products limit:5
```

`SHOP_DOMAIN` and `ACCESS_TOKEN` are installation secrets: each installation connects one
store. `SHOP_DOMAIN` is the store's `myshopify.com` name, with or without the suffix
(`your-store` or `your-store.myshopify.com`). The access token comes from a custom app created
in the store's admin, with the Admin API scopes the tools need.

## Terms of use

Shopify's own terms apply to everything the app does on your behalf. TODO: link Shopify's API
terms. `https://www.shopify.com/legal/api-terms` did not answer when this README was written
(the connection timed out), so the URL could not be confirmed.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Shopify's press
kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
