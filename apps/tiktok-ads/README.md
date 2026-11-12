# TikTok Ads

Lets an agent work with TikTok ad accounts through the TikTok API for Business (Marketing API
v1.3, `https://business-api.tiktok.com/open_api/v1.3`). It can list the ad accounts a token can
reach, list campaigns, ad groups and ads, and run performance and audience reports. It can also
pause or enable delivery and change a campaign or ad group budget. It does not create or delete
anything. Enabling delivery and budget changes affect spend: they are marked destructive and ask
for approval.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-advertisers` | The ad accounts (advertisers) the access token is authorized for. Needs the app credentials (system secrets). | no |
| `get-advertiser-info` | Account details: status, currency, time zone, balance, company, country (up to 100 accounts). | no |
| `list-campaigns` | Campaigns of one account with status, budget and budget mode; filters by id, name and status; paged. | no |
| `list-ad-groups` | Ad groups, optionally of some campaigns, with status, budget, bidding and schedule; paged. | no |
| `list-ads` | Ads, optionally of some campaigns or ad groups, with status, format, text and landing page; paged. | no |
| `get-report` | Synchronous report (`report/integrated/get`): BASIC or AUDIENCE, any level, dimensions, metrics, date range or lifetime, filters, totals. Returns columns and rows. | no |
| `pause-delivery` | Pauses up to 20 campaigns, ad groups or ads (reversible). | yes, sensitive |
| `enable-delivery` | Enables up to 20 campaigns, ad groups or ads. **Affects spend.** | yes, sensitive, destructive |
| `update-budget` | Sets one campaign or ad group budget; returns the previous budget so it can be reverted. **Affects spend.** | yes, sensitive, destructive |

Limits:

- Lists return at most 100 items per page, reports at most 500 rows per page, and every result
  stays under 50,000 characters (`limitApplied` on lists, a `[RESULT_TOO_LARGE]` error naming
  what to shrink on reports).
- Report date ranges are at most 365 days. TikTok applies stricter limits of its own (for
  example on hourly data) and says so in a `[BAD_REQUEST]` error.
- Report dates and `stat_time_*` values are in the ad account's time zone; money is in the
  account currency (see `get-advertiser-info`).

### TikTok ids and the CLI

TikTok ids (advertiser, campaign, ad group, ad) are 16-19 digit numbers, above JavaScript's
safe integer range. The `agentapps` CLI turns `key:value` arguments that look like numbers into
numbers, which would round such an id to a different one. The tools refuse a rounded id, so pass
ids inside a single JSON object (or as JSON on stdin):

```bash
agentapps tiktok-ads tool list-campaigns '{"advertiserId":"7012345678901234567"}'
```

MCP clients send JSON, so this only matters on the command line.

## Setup

The app needs three values: the TikTok developer app's id and secret (system secrets, shared by
every installation) and an advertiser access token (a user secret, per installation).

1. **Developer account and app.** Sign in at the
   [TikTok API for Business portal](https://business-api.tiktok.com/portal) with a TikTok for
   Business account, register as a developer and create an app (My Apps, Create). Give it an
   advertiser redirect URL you control and request the Marketing API permission scopes this app
   uses: **Ad Account Management** (account list and info), **Ads Management** (campaigns, ad
   groups, ads, status and budget changes) and **Reporting**. TikTok reviews new apps; once it is
   approved, the app page shows the **App ID**, the **Secret** and an **advertiser authorization
   URL**.
2. **Authorize the ad accounts.** Open the advertiser authorization URL while signed in as a
   user with access to the ad accounts (or the Business Center that owns them), pick the
   accounts and confirm. TikTok redirects to your redirect URL with an `auth_code` query
   parameter, valid for a short time.
3. **Exchange the code for a long-lived access token** (once, by hand):

   ```bash
   curl -s -X POST https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/ \
     -H 'Content-Type: application/json' \
     -d '{"app_id":"<App ID>","secret":"<Secret>","auth_code":"<auth_code>"}'
   ```

   The answer's `data.access_token` is the token, and `data.advertiser_ids` lists the accounts it
   can manage. TikTok issues advertiser tokens as long-term tokens with no refresh step; one
   stops working when the advertiser revokes the authorization, and the tools then answer
   `[AUTH_REQUIRED]`. To add accounts later, authorize again and use the new token.
4. **Install and configure:**

   ```bash
   agentapps install app.tiktok-ads tiktok-ads
   # System secrets: set on the app id, shared by every installation
   agentapps config app.tiktok-ads TIKTOK_APP_ID:"<App ID>"
   agentapps config app.tiktok-ads TIKTOK_APP_SECRET:"<Secret>"
   # User secret: set on the installed alias
   agentapps config tiktok-ads TIKTOK_ACCESS_TOKEN:"<access_token>"
   agentapps tiktok-ads tools
   agentapps tiktok-ads tool list-advertisers
   agentapps tiktok-ads tool get-report '{"advertiserId":"<id>","startDate":"2026-10-01","endDate":"2026-10-07","dimensions":["campaign_id","stat_time_day"]}'
   ```

- `TIKTOK_ACCESS_TOKEN` (user secret, required): the advertiser access token from step 3. Every
  tool needs it.
- `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET` (system secrets): only `list-advertisers` and the health
  check use them, because TikTok's advertiser list endpoint asks for the app credentials next to
  the token. Without them the other tools still work with an advertiser id you already know (from
  step 3 or TikTok Ads Manager), and the health check reports `degraded`.

### Why not the host's OAuth flow

TikTok's authorization does not follow the standard OAuth 2.0 shape the host implements: the
authorize URL takes `app_id` instead of `client_id`, the callback carries `auth_code`, the token
exchange is a JSON body (`app_id`, `secret`, `auth_code`) instead of a form post, and the token
comes back inside TikTok's `{ code, message, data }` envelope instead of a top-level
`access_token`. Since the advertiser token is long-term, a one-time manual exchange is enough.

## Terms of use

Using the API requires a TikTok for Business developer account and accepting the TikTok For
Business Developer Terms when registering in the
[API for Business portal](https://business-api.tiktok.com/portal), on top of the TikTok
Advertising Terms that govern the ad accounts. See TikTok's
[About API for Business](https://ads.tiktok.com/help/article/marketing-api) help article. The API
is rate limited per app and advertiser; when TikTok answers with code 40100 the tools return a
`[RATE_LIMITED]` error and the agent should wait before retrying.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.png | TikTok for Developers logo pack, linked from the [design guidelines](https://developers.tiktok.com/doc/getting-started-design-guidelines) (`logo-pack.zip`), `TikTok Logo Pack/TikTok – Icons/TikTok_Icon_Black_Square.png` (1200x1200) | none (renamed) |

TODO: no official one-colour SVG found yet for `assets/logo-mono.svg`. Searched: the TikTok for
Developers logo pack above (SVGs only for the "Continue with TikTok" buttons, which contain text;
the icon itself is PNG and Adobe Illustrator only), the
[TikTok Brand Hub](https://tiktokbrandhub.com/) linked from the developer site (pages rendered
by JavaScript with no downloadable files; its favicon SVG is the note on a coloured square
badge, which leaves a solid block once the fills are removed), the TikTok for Developers site
header (a multi-colour layered "TikTok for Developers" wordmark), and the tiktok.com and
TikTok for Business home pages (no SVG logo in the served HTML).
