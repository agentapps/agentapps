# Google Search Console

Lets an agent work with [Google Search Console](https://search.google.com/search-console) for the
properties the connected Google account can see: query the Performance report (clicks,
impressions, CTR and average position by query, page, country, device, search appearance, date
or hour), find what gained or lost traffic between two periods, inspect how Google indexed a URL,
and manage sitemaps and properties. It calls the
[Search Console API](https://developers.google.com/webmaster-tools) (`searchconsole.googleapis.com`,
the `webmasters/v3` resources and the URL Inspection API) with plain `fetch` and Google OAuth.

Limits worth knowing: Performance data is in Pacific Time, lags about 2-3 days for final data and
goes back about 16 months; Google returns the top rows only, not every long-tail query. URL
inspection is limited to about 2,000 calls per property per day and 600 per minute. The app
cannot verify ownership of a new property (that happens in the Search Console UI or with DNS),
and it does not request indexing of single URLs (the API has no such method).

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-sites` | List the properties the account can see, with the permission level | no |
| `query-search-analytics` | Full Performance report query: dimensions, filters, search type, data state, paging | no |
| `get-top-queries` | Top queries by clicks for a range, optionally for one page, country or device | no |
| `get-top-pages` | Top pages by clicks for a range, optionally for one query, country or device | no |
| `compare-periods` | Gains and losses per query, page, country, device or appearance vs the previous period or year | no |
| `inspect-url` | Index status of one URL: verdict, coverage, canonical, last crawl, rich results | no |
| `list-sitemaps` | Sitemaps of a property (or of one sitemap index) with errors, warnings and counts | no |
| `get-sitemap` | Processing status of one sitemap | no |
| `submit-sitemap` | Submit or resubmit a sitemap | yes |
| `delete-sitemap` | Remove a sitemap from the Sitemaps report (destructive) | yes |
| `add-site` | Add a property to the account (it stays unverified until verified in the UI) | yes |
| `delete-site` | Remove a property from the account (destructive) | yes |

The four write tools are marked `sensitive`, so hosts ask before running them; `delete-sitemap`
and `delete-site` are also `destructiveHint: true`. Nothing in this app spends money.

`siteUrl` is always the property exactly as `list-sites` returns it: `sc-domain:example.com`
for a Domain property, or `https://www.example.com/` (with the trailing slash) for a URL-prefix
property.

## Setup

The app uses Google OAuth 2.0. Someone who runs the station creates the OAuth client once; every
user then connects their own Google account.

### 1. Google Cloud project (once per station)

1. In the [Google Cloud console](https://console.cloud.google.com/), pick or create a project and
   enable the **Google Search Console API** (APIs & Services > Library).
2. Configure the OAuth consent screen (Google Auth Platform > Branding / Audience / Data
   access) and add the scopes
   `https://www.googleapis.com/auth/webmasters` and
   `https://www.googleapis.com/auth/userinfo.email`. `webmasters` is a Google *sensitive* scope:
   while the app is in Testing mode only the listed test users can connect, and publishing it
   for any Google account needs Google's OAuth app verification.
3. Create an OAuth client ID of type **Web application** and add the authorized redirect URI
   `<station public URL>/auth/callback` (for example
   `https://your-station.example.com/auth/callback`). The station builds that URL from
   `station.publicUrl` in `agentapps.json`.
4. Store the client as system secrets, shared by every installation of the app:

```bash
agentapps config app.google.search-console CLIENT_ID:"<client id>.apps.googleusercontent.com" CLIENT_SECRET:"<client secret>"
# Only if agentapps.json has no station.publicUrl:
agentapps config app.google.search-console REDIRECT_URI:"https://your-station.example.com/auth/callback"
```

### 2. Connect a Google account (each user)

```bash
agentapps install app.google.search-console gsc
agentapps gsc auth            # opens Google's consent page; approve every permission
agentapps gsc tool list-sites
agentapps gsc tool get-top-queries siteUrl:sc-domain:example.com days:28 limit:10
```

The OAuth flow stores the installation secrets `ACCESS_TOKEN`, `REFRESH_TOKEN` and `EXPIRY_DATE` on the
installation (`gsc` above); users never set them by hand. The host refreshes the access token
when it expires, and the app asks the host for one refresh if Google still rejects a token. If
the refresh token is revoked or expires, reconnect with `agentapps gsc auth reauth`.

The account only sees properties it has access to in Search Console; `siteUnverifiedUser`
entries have no data.

### Scopes

| Scope | Why |
|---|---|
| `https://www.googleapis.com/auth/webmasters` | Reads, plus `submit-sitemap`, `delete-sitemap`, `add-site` and `delete-site`. `webmasters.readonly` would cover only the reads, and submitting a sitemap is one of the most useful actions for an SEO agent. |
| `https://www.googleapis.com/auth/userinfo.email` | Lets the host show which Google account is connected. |

The protocol version in this repo has no `access` manifest field yet, so the app does not declare
one.

## Terms of use

Use of the API is governed by the
[Google APIs Terms of Service](https://developers.google.com/terms) and the
[Search Console API usage limits](https://developers.google.com/webmaster-tools/limits)
(per-site and per-user quotas; URL Inspection about 2,000 queries per day and 600 per minute per
property). Apps that request the `webmasters` scope from users outside your organisation must
follow the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
and pass OAuth app verification.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | Google's product logo CDN, `https://www.gstatic.com/images/branding/productlogos/search_console/v1/192px.svg` (the official Search Console product icon) | removed the `<?xml ...?>` declaration line |
| assets/logo-mono.svg | same file | also removed the six `fill="#..."` colour attributes; the `fill="none"` helper shapes stay invisible |

Also checked: the Search Console page `https://search.google.com/search-console/about` shows the
full lockup `https://www.gstatic.com/search-console/scfe/logo_search_console.svg` (icon plus
wordmark, not used), and Google's product icon PNG
`https://www.gstatic.com/images/branding/product/2x/search_console_512dp.png` (1024x1024, the
same icon).
