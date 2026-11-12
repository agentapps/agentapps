# Meta Ads

Lets an agent report on and manage Meta (Facebook and Instagram) advertising through the
[Meta Marketing API](https://developers.facebook.com/docs/marketing-api), Graph API **v26.0**.
It lists ad accounts, campaigns, ad sets, ads and creatives, runs performance reports
(Ads Insights) at any level with date ranges, daily series and breakdowns, pauses and
activates delivery, changes budgets, and creates campaigns and ad sets. New campaigns and ad
sets are always created **paused**. Creating ads (images, video, Page posts) is not
supported: finish ads in Ads Manager.

Every write asks for approval by default. The tools that can make you spend money
(`activate-ad-object`, `update-budget`) are marked destructive and say so in their
descriptions.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-ad-accounts` | Ad accounts the token can use: id, name, status, currency, time zone, amount spent | no |
| `list-campaigns` | Campaigns of an account: objective, status, effective status, budgets, bid strategy | no |
| `list-ad-sets` | Ad sets of a campaign or account: budgets, optimisation goal, billing, schedule, targeting on request | no |
| `list-ads` | Ads of an ad set, campaign or account, with their creative and delivery issues | no |
| `list-creatives` | Ad creatives of an account: title, body, thumbnail, call to action | no |
| `get-insights` | Performance report for an account, campaign, ad set or ad: spend, impressions, reach, clicks, CTR, CPC, CPM or any Insights field; level, date preset or range, daily/weekly/monthly series, breakdowns, sort | no |
| `pause-ad-object` | Pause a campaign, ad set or ad (stops spend; reversible) | yes |
| `activate-ad-object` | Activate a campaign, ad set or ad. **Starts spending money** (destructive) | yes |
| `update-budget` | Change the daily or lifetime budget of a campaign or ad set. **Affects spend** (destructive) | yes |
| `create-campaign` | Create a campaign, always PAUSED, with or without a campaign budget | yes |
| `create-ad-set` | Create an ad set in a campaign, always PAUSED, with targeting and budget | yes |

Before any status or budget change the app reads the object with a field only that kind of
object has, so a write meant for an ad never lands on an ad set. Budgets are integers in the
account currency's minor units (cents: `5000` = 50.00); Insights `spend` is in major units.

## Setup

The app needs one user secret, `META_ACCESS_TOKEN`, and no system secrets.

```bash
agentapps install app.meta-ads meta-ads
agentapps config meta-ads META_ACCESS_TOKEN:"<token>"
agentapps meta-ads tools
agentapps meta-ads tool list-ad-accounts
agentapps meta-ads tool get-insights id:act_1234567890 level:campaign datePreset:last_7d
```

Installation secrets are per installation: set them on the alias (`meta-ads` above), not on
`app.meta-ads`. (`agentapps config app.meta-ads KEY:value` sets system secrets shared by every
installation; this app declares none.)

Campaign, ad set and ad ids have up to 18 digits, more than a JavaScript number holds. The
CLI turns `id:120210000000000001` into a rounded number, which the app rejects. Pass such
calls as one JSON object instead, which keeps strings:

```bash
agentapps meta-ads tool pause-ad-object '{"level":"campaign","id":"120210000000000001"}'
```

### Getting `META_ACCESS_TOKEN` (recommended: a System User token)

A System User token belongs to your business, not to a person, and does not expire. It can
reach exactly the ad accounts you assign to the System User.

1. **Business portfolio.** You need a Meta business portfolio
   ([business.facebook.com](https://business.facebook.com)) that owns, or has partner access
   to, the ad accounts. You need admin rights in it.
2. **Meta app.** At [developers.facebook.com/apps](https://developers.facebook.com/apps),
   create a Business app, add the Marketing API (the ads management use case) and connect the
   app to the business portfolio. No App Review is needed to manage your own business's ad
   accounts: standard access to `ads_read` and `ads_management` is enough. Leave **Require App Secret** off in the app's advanced settings:
   this app does not send `appsecret_proof`.
3. **System User.** In [Business Settings](https://business.facebook.com/settings) → Users →
   **System Users**, click **Add** and create a System User (role Employee is enough; Admin
   also works). Then, on that System User, click **Add assets**: under **Ad accounts**, pick
   each ad account and allow managing campaigns (needed by the write tools) or only viewing
   performance (reporting only); under **Apps**, pick your app.
4. **Token.** On the same System User, click **Generate new token**, select your app, and
   permission:
   - `ads_read`: every read tool and reports,
   - `ads_management`: pause, activate, budgets, create,
   - `business_management`: lists ad accounts the business reaches through other portfolios.

   System User tokens do not expire by default (if an expiry choice is shown, pick
   **Never**). Copy it right away: Meta shows it only once. A reporting-only installation can
   use a token with just `ads_read` (writes then fail with `[FORBIDDEN]`). Meta's guides:
   [System Users](https://developers.facebook.com/docs/marketing-api/system-users),
   [Generate an access token](https://developers.facebook.com/docs/marketing-api/system-users/install-apps-and-generate-tokens#generate-token).
5. Store it: `agentapps config <alias> META_ACCESS_TOKEN:"<token>"`. In this repo,
   `META_ACCESS_TOKEN=... node packages/create/dist/cli.js health apps/meta-ads` runs the
   health check, which calls `/me` and names the token's owner.

Account ids: `list-ad-accounts` returns them as `act_<digits>`; every tool also accepts the
bare digits.

**Access tier and limits.** New apps get the Marketing API's **Limited access** tier: heavily
rate-limited per ad account and meant for development, with 1 System User. For everyday use,
request **Full access** with **+Upgrade** on the Marketing API Access Tier feature in the App
Dashboard once the app qualifies (500 Marketing API calls in the past 15 days, at the time of
writing); see [Authorization](https://developers.facebook.com/docs/marketing-api/get-started/authorization)
and [Rate limiting](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting).
Throttling comes back as `[RATE_LIMITED]`: wait a few minutes. Ad set budgets can change about
4 times per hour.

### Alternative: a personal long-lived token

A user access token from the [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
(with the same three permissions), exchanged for a long-lived one, also works, but it expires
after about 60 days and reaches only the ad accounts that person can use. When it expires,
calls fail with `[AUTH_REQUIRED]` and you set a new one with the same `agentapps config` line.

### Why not OAuth (Facebook Login) in the app

The host's generic OAuth flow (authorize URL + code exchange, refresh with a refresh token)
does not fit Meta today:

- Business apps log in with **Facebook Login for Business**, which takes a `config_id` (a
  login configuration created per Meta app) instead of `scope`, plus
  `override_default_response_type=true` for System User tokens. The host builds the authorize
  URL from the manifest's static `authorizeUrl` and `scopes` and the `CLIENT_ID` system secret;
  it has no way to add a per-deployment `config_id`, and the schema requires a non-empty
  `scopes` list that Meta says not to send.
- With a user-token configuration, Meta returns a short-lived token (hours) and **no refresh
  token**, so the host's refresh never runs. The app would have to exchange it for a 60-day
  token (`fb_exchange_token`, needs the app secret) and a person would still reconnect every
  60 days.
- Using `ads_read` / `ads_management` on ad accounts of other businesses requires Meta App
  Review (advanced access) and business verification.

A System User token pasted once avoids all of this. An OAuth variant would need: `auth.type:
"oauth2"` with a `facebook` provider (authorize
`https://www.facebook.com/v26.0/dialog/oauth`, token
`https://graph.facebook.com/v26.0/oauth/access_token`), only `ACCESS_TOKEN` as user secret,
system secrets `CLIENT_ID`, `CLIENT_SECRET` and a `CONFIG_ID` set once with
`agentapps config app.meta-ads CLIENT_ID:<app id>` (and so on), and a host change that adds
`config_id` and `override_default_response_type` to the authorize URL.

Meta also hosts an official Ads MCP server (`https://mcp.facebook.com/ads`). This app differs
from it by asking for approval before each write, marking spend-affecting tools destructive,
keeping a small set of bounded tools, and storing one token per installation.

## Terms of use

Use of the Marketing API is governed by the
[Meta Platform Terms](https://developers.facebook.com/terms) and the
[Developer Policies](https://developers.facebook.com/devpolicy/) (including the Marketing API
section). Ads you create or activate must follow
[Meta's Advertising Standards](https://transparency.meta.com/policies/ad-standards/), and ads
about employment, housing, credit, social issues, elections or politics, gambling or financial
products must declare their special ad category. Graph API versions are supported for about
two years; this app pins v26.0 (released July 2026).

## Logos

TODO: no logo shipped yet; `assets/logo.svg` and `assets/logo-mono.svg` are placeholders.
Searched: the [Meta brand resource center](https://www.meta.com/brand/resources/meta/company-brand/)
has the official Meta company lockup (four colour variants, including mono), but the download
sits behind accepting Meta's brand terms, and the page says "All usage of the Meta logo
requires approval" through Meta's Brand Review process, which a person at the company has to
request. The meta.com site icon (`static.xx.fbcdn.net`, gradient symbol) is under the same
terms, and the guidelines say the Meta logo must not stand for Facebook. Icon collections
(Bootstrap Icons, logo aggregators) are not official sources. Next step: a person accepts the
terms (or gets Brand Review approval), downloads the lockup zip from the brand page, and adds
the primary symbol as `assets/logo.svg` and the mono symbol, with fills removed, as
`assets/logo-mono.svg`.
