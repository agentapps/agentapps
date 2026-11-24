# QuickBooks

Lets an agent work with one QuickBooks Online company: read invoices, customers, payments,
items, vendors, bills, the chart of accounts and two reports, and create invoices, estimates,
customers and vendors. It uses the QuickBooks Online Accounting API at
`https://quickbooks.api.intuit.com/v3/company/{REALM_ID}` (minor version 73) with an OAuth
token that has the `com.intuit.quickbooks.accounting` scope. The host is fixed.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-invoices` | Lists invoices, up to `maxResults`. | no |
| `get-invoice` | Returns one invoice by id. | no |
| `create-invoice` | Creates an invoice for a customer with at least one line. | yes, asks first |
| `list-customers` | Lists customers, up to `maxResults`. | no |
| `get-customer` | Returns one customer by id. | no |
| `create-customer` | Creates a customer. | yes, asks first |
| `update-customer` | Changes a customer. Needs its id and the `SyncToken` that `get-customer` returns. | yes, asks first |
| `list-items` | Lists items (products and services), up to `maxResults`. | no |
| `get-payment` | Returns one payment by id. | no |
| `get-company-info` | Returns the company's name, address and fiscal year. | no |
| `list-accounts` | Lists the chart of accounts, up to `maxResults`. | no |
| `get-account` | Returns one account of the chart of accounts by id. | no |
| `list-vendors` | Lists vendors, up to `maxResults`. | no |
| `create-vendor` | Creates a vendor. | yes, asks first |
| `list-bills` | Lists bills, up to `maxResults`. | no |
| `create-estimate` | Creates an estimate for a customer with at least one line. | yes, asks first |
| `get-profit-and-loss` | Returns the Profit and Loss report for a date range. | no |
| `get-balance-sheet` | Returns the Balance Sheet report for a date range. | no |

Limits:

- The app deletes nothing and records no payments.
- Requests are not retried.

## Setup

```bash
agentapps install app.quickbooks quickbooks
agentapps config app.quickbooks CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
agentapps quickbooks auth
agentapps quickbooks tools
agentapps quickbooks tool list-invoices maxResults:5
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets: one OAuth client for every
installation of the app. Create an app in the Intuit Developer portal, copy its client id and
secret, and add the Station's redirect URI, `{station URL}/auth/callback`, to the app's redirect
URIs.

`agentapps quickbooks auth` opens Intuit's sign-in and stores `ACCESS_TOKEN` and `REFRESH_TOKEN`
for the installation. The app also needs `REALM_ID`, the id of the QuickBooks company. If a tool
answers that `REALM_ID` is missing, set it:

```bash
agentapps config quickbooks REALM_ID:<company id>
```

## Terms of use

Intuit's own terms apply to everything the app does on your behalf. Intuit lists them at
<https://www.intuit.com/legal/terms/>. TODO: link the terms for Intuit's developer services; the
developer site answers every path with the same page, so the URL could not be confirmed.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | `sbseg-logo-qb-ball-50-50-gwp-wr-us.svg` in <https://static.developer.intuit.com/resources/qb_logo_icon.zip> | none |
| assets/logo-mono.svg | the same file | the white shape cut out of the background with `fill-rule="evenodd"` instead of painted on it; colours replaced by `currentColor`. The path data is unchanged |

TODO: confirm the source. Intuit's [logo guidelines](https://developer.intuit.com/app/developer/qbo/docs/go-live/list-on-the-app-store/naming-and-logo-guidelines) link "Download approved QuickBooks Logo Icon" to an address behind a sign-in. The zip used here has the same file name on Intuit's public developer host, where no page links to it; that it is the same file was not confirmed.
