# Google Ads

Lets an agent work with Google Ads accounts through the [Google Ads API](https://developers.google.com/google-ads/api/docs/start)
(REST, version **v26**, plain `fetch`, no SDK). It lists the accounts a Google user can reach,
directly or through manager (MCC) accounts, reports on account, campaign, ad group, ad,
keyword and search term performance, runs read-only GAQL queries, and makes a small set of
changes: pause or enable campaigns and ad groups, change a campaign budget, add negative
keywords. It does not create campaigns, ads or keywords, and it does not remove anything.

Limits: reports return at most 500 rows (1,000 accounts for `list-client-accounts`) and stay
under about 45,000 characters; each call gives up after 30 s. Google applies a daily operation
quota per developer token (see Setup). Money in results is in the account currency, not micros,
except in the raw rows of `run-gaql-query`.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-accessible-customers` | Accounts the connected user can reach directly; flags manager accounts | no |
| `list-client-accounts` | Client accounts under a manager account, and the `loginCustomerId` to use for them | no |
| `get-account-summary` | Account details and total metrics for a date range | no |
| `list-campaigns` | Campaigns with status, channel, bidding strategy and budget (no metrics) | no |
| `list-campaign-budgets` | Budgets with amount, period and how many campaigns share each | no |
| `get-performance-report` | Metrics per campaign, ad group, ad or keyword, optionally per day | no |
| `get-search-terms-report` | The search queries that triggered ads, with the matched keyword | no |
| `run-gaql-query` | Any read-only GAQL `SELECT`, with paging | no |
| `pause-campaign` | Pause a campaign (stops spend; reversible) | yes |
| `enable-campaign` | Enable a campaign. **Affects spend**, marked destructive | yes |
| `pause-ad-group` | Pause an ad group (reversible) | yes |
| `enable-ad-group` | Enable an ad group. **Affects spend**, marked destructive | yes |
| `update-campaign-budget` | Set a budget amount. **Affects spend**, marked destructive | yes |
| `add-negative-keywords` | Add up to 100 negative keywords to a campaign or ad group | yes |

All write tools are `sensitive` (the host asks before running them) and accept
`validateOnly: true`, which makes Google check the change without applying it. Date ranges are
a preset (`dateRange`, default `LAST_30_DAYS`) or `startDate` + `endDate` (`YYYY-MM-DD`), in
the account's time zone.

### Manager accounts and `loginCustomerId`

Every tool that works on an account takes `customerId` (10 digits, dashes allowed) and an
optional `loginCustomerId`. When the connected Google user reaches an account only through a
manager (MCC) account, Google needs that manager's ID in the `login-customer-id` header: pass
it as `loginCustomerId`. It is a tool parameter rather than a setting because one user often
works with several managers, and a per-installation secret would have to be set (to a
placeholder) even by users without one. `list-accessible-customers` shows which accounts are
managers and `list-client-accounts` returns the `loginCustomerId` to use for each client. A
`USER_PERMISSION_DENIED` error says when it is missing.

## Setup

The app uses Google OAuth plus a Google Ads developer token. You need:

1. **A Google Cloud project** with the **Google Ads API** enabled
   (APIs & Services > Library > Google Ads API).
2. **An OAuth client** in that project (APIs & Services > Credentials > Create credentials >
   OAuth client ID, type *Web application*), with the station callback as an authorised
   redirect URI: `<station publicUrl>/auth/callback`. This gives `CLIENT_ID` and `CLIENT_SECRET`.
3. **The OAuth consent screen** with the scopes `https://www.googleapis.com/auth/adwords` and
   `https://www.googleapis.com/auth/userinfo.email`. `adwords` is a sensitive scope: while the
   app is in *Testing* only the listed test users can connect and their refresh tokens expire
   after 7 days; for real users Google must verify the app (Publish app, then verification).
4. **A developer token** (`DEVELOPER_TOKEN`) from a Google Ads **manager** account: Admin >
   API Center ([guide](https://developers.google.com/google-ads/api/docs/get-started/dev-token)).
   A new token has *Test* access (test accounts only). Production accounts need *Explorer*
   (2,880 operations a day), *Basic* (15,000 a day, after brand verification) or *Standard*
   (unlimited, after a compliance review), each applied for from the API Center
   ([access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels)).
   Use the token with the OAuth client of the same Google Cloud project.
5. **The customer IDs** you will work with: the 10-digit number at the top of the Google Ads
   UI (`123-456-7890`), and the manager account ID when you access clients through one.
   `list-accessible-customers` finds them too.

System secrets (shared by every installation, set on the app id):

```bash
agentapps config app.google.ads CLIENT_ID:"<oauth client id>"
agentapps config app.google.ads CLIENT_SECRET:"<oauth client secret>"
agentapps config app.google.ads REDIRECT_URI:"https://your-station.example.com/auth/callback"
agentapps config app.google.ads DEVELOPER_TOKEN:"<developer token>"
```

`REDIRECT_URI` is only needed when `agentapps.json` has no `station.publicUrl`.

Then install an instance and connect a Google account (installation secrets belong to the alias;
`ACCESS_TOKEN`, `REFRESH_TOKEN`, `EMAIL` and `EXPIRY_DATE` are written by the OAuth flow, not
by hand):

```bash
agentapps install app.google.ads google-ads
agentapps google-ads auth
agentapps google-ads tool list-accessible-customers
agentapps google-ads tool get-performance-report customerId:123-456-7890 dateRange:LAST_7_DAYS
agentapps google-ads tool list-client-accounts customerId:987-654-3210
```

If you ever need to set a user secret by hand, use the alias, not the app id:
`agentapps config google-ads KEY:value`.

## Terms of use

Use of the Google Ads API is governed by the
[Google Ads API Terms and Conditions](https://developers.google.com/google-ads/api/terms) and
the [Google Ads API policies](https://developers.google.com/google-ads/api/docs/api-policy/developer-token):
the developer token belongs to whoever applied for it, its daily operation quota applies to all
users of that token, and tools built on it must not be used to break the
[Google Ads policies](https://support.google.com/adspolicy/answer/6008942). Spend caused by
`enable-campaign`, `enable-ad-group` or `update-campaign-budget` is billed to the advertiser
account as usual.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | Google's official Google Ads product logo, `https://www.gstatic.com/images/branding/productlogos/ads/v5/192px.svg` (Google's product-logo CDN; the same file `ads.google.com/home/` shows as the Google Ads icon) | none |
| assets/logo-mono.svg | the same file | removed the three `fill="#..."` colour attributes; the transparent bounding `rect fill="none"` and every shape are unchanged |
