# LinkedIn Ads

Lets an agent report on and manage LinkedIn advertising through the
[LinkedIn Marketing API](https://learn.microsoft.com/en-us/linkedin/marketing/) (Advertising
API, versioned REST at `https://api.linkedin.com/rest`, pinned to `LinkedIn-Version: 202610`).
It lists ad accounts, campaign groups, campaigns and creatives, reports performance with
`adAnalytics` (impressions, clicks, spend, conversions, leads, by campaign, creative or member
demographics), and pauses, activates or re-budgets campaigns, campaign groups and creatives.
It does not create campaigns or ads, upload audiences or read leads.

The app needs a LinkedIn developer application approved for the **Advertising API**; see
[Setup](#setup).

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-ad-accounts` | Ad accounts the member can access: id, name, status, currency, serving status | no |
| `list-campaign-groups` | Campaign groups of an account, with budget, schedule and status | no |
| `list-campaigns` | Campaigns of an account (optionally per group): budget, bid, objective, status | no |
| `get-campaign` | One campaign with its targeting criteria and settings | no |
| `list-creatives` | Creatives (ads) of an account or campaigns, with serving and review status | no |
| `get-ad-analytics` | Performance report over a date range, 1-3 pivots or one demographic pivot | no |
| `pause-campaign` | Set a campaign to PAUSED (stops spend; reversible) | yes |
| `activate-campaign` | Set a campaign to ACTIVE. **Affects spend** (destructive) | yes |
| `update-campaign-budget` | Set a campaign's daily and/or total budget. **Affects spend** (destructive) | yes |
| `pause-campaign-group` | Set a campaign group to PAUSED (stops spend; reversible) | yes |
| `activate-campaign-group` | Set a campaign group to ACTIVE. **Affects spend** (destructive) | yes |
| `update-campaign-group-budget` | Set a campaign group's total budget. **Affects spend** (destructive) | yes |
| `pause-creative` | Set a creative to PAUSED (stops that ad; reversible) | yes |
| `activate-creative` | Set a creative to ACTIVE. **Affects spend** (destructive) | yes |

Every write tool is `sensitive` (asks for approval by default). Tools that let LinkedIn spend
money are `destructiveHint: true`, because spent money cannot be undone; pausing is not
destructive, since it stops spend and activating again reverses it. The budget tools read the
entity first and return the previous and the new budget.

Limits worth knowing:

- Lists are cursor-paged (`nextPageToken` in, `pageToken` out): at most 100 accounts, groups or
  creatives and 50 campaigns per page, so every result stays under 50,000 characters.
- `get-ad-analytics` returns columns (`pivotValues`, `start`, `end`, one array per metric).
  DAILY reports cover at most 92 days and MONTHLY ones 36 months; at most 18 metrics per call.
  LinkedIn does not page this endpoint, so an oversized report is cut with `limitApplied: true`
  and a note on how to narrow it. `costInLocalCurrency` is a decimal string in the account
  currency. Demographic (`MEMBER_*`) values are approximate, delayed 12-24 h and limited to the
  top 100 values per creative per day.
- LinkedIn throttles `adAnalytics` at 45 million metric values per 5 minutes per app; other
  endpoints have daily per-app and per-member limits shown in the Developer Portal
  (Analytics tab). A throttled call returns `[RATE_LIMITED]`.
- The API version is pinned in `src/lib/client.ts` (`LINKEDIN_VERSION`). LinkedIn supports each
  monthly version for at least a year and rejects sunset ones: move it forward before
  October 2027.

## Setup

### 1. Get Advertising API access (once, by whoever runs the station)

1. Have a [LinkedIn Page](https://www.linkedin.com/help/linkedin/answer/a543852) for your
   company: every developer application must be associated with one.
2. Create an application in the [Developer Portal](https://www.linkedin.com/developers/apps/new).
3. Under **Products**, request **Advertising API** and complete the access form. LinkedIn
   reviews it; on approval the app gets the `r_ads`, `r_ads_reporting` and `rw_ads` scopes
   (this app requests exactly these three).
4. Know the tiers ([Increasing Access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access)):
   - **Development** (default): reads every ad account the member can access, but **writes only
     to up to 5 ad accounts** that you map to the app: copy the nine-digit account id from
     [Campaign Manager](https://www.linkedin.com/campaignmanager/accounts), then Developer
     Portal > your app > Products > View Ad Accounts > Add Ad Account.
   - **Standard**: writes to any account the member manages. Request it through the
     [Developer Support Portal](https://www.linkedin.com/help/linkedin/ask/dsapi) with a video of
     the integration.
5. Under **Auth**, add the station's OAuth callback as an authorized redirect URL:
   `<station publicUrl>/auth/callback` (for example
   `https://your-station.example.com/auth/callback`). Copy the **Client ID** and **Primary
   Client Secret**.

Set them as system secrets, shared by every installation of the app:

```bash
agentapps config app.linkedin-ads CLIENT_ID:"<client id>" CLIENT_SECRET:"<client secret>"
```

### 2. Install and connect an account (per user)

```bash
agentapps install app.linkedin-ads linkedin-ads
agentapps linkedin-ads auth            # opens LinkedIn's consent page through the station
agentapps linkedin-ads tool list-ad-accounts
agentapps linkedin-ads tool get-ad-analytics accountId:<account id> startDate:2026-10-01 pivots:'["CAMPAIGN"]'
```

`agentapps linkedin-ads auth` stores the installation secrets `ACCESS_TOKEN`, `EXPIRY_DATE` and, for
apps LinkedIn has approved for refresh tokens, `REFRESH_TOKEN`. The member who consents needs a
role on each ad account (Campaign Manager > Account settings > Manage access): `VIEWER` is
enough for the read tools; the write tools need `CAMPAIGN_MANAGER`, `ACCOUNT_MANAGER` or
`ACCOUNT_BILLING_ADMIN` (`CREATIVE_MANAGER` for creatives).

Without a station, set a token by hand instead. Generate one with the
[Token Generator](https://www.linkedin.com/developers/tools/oauth/token-generator) for your app
with the scopes `r_ads r_ads_reporting rw_ads`, then set it on the installed alias (user
secrets belong to the alias, not to `app.linkedin-ads`):

```bash
agentapps config linkedin-ads ACCESS_TOKEN:"<access token>"
```

### Token lifetime

LinkedIn access tokens last **60 days**. Programmatic refresh tokens (valid one year) are issued
**only to approved Marketing Developer Platform partners**. With one, the app refreshes an
expired token itself (and the host refreshes it before expiry); without one, tools answer
`[AUTH_EXPIRED]` after 60 days and the user reconnects with `agentapps linkedin-ads auth reauth`
(or sets a new `ACCESS_TOKEN`).

### Ids

Account, campaign group, campaign and creative ids are numbers (`508000001`); tools also accept
the URN (`urn:li:sponsoredCampaign:141000001`). Start with `list-ad-accounts`. To try writes
without spending, create a test ad account through the API (one per developer app); its
campaigns never serve and are never billed.

## Terms of use

Using this app means using the LinkedIn API under the
[LinkedIn API Terms of Use](https://www.linkedin.com/legal/l/api-terms-of-use) and the
[LinkedIn Marketing API Terms](https://www.linkedin.com/legal/l/marketing-api-terms), within the
access tier LinkedIn granted your developer application, and LinkedIn's
[restricted uses](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases)
of Marketing API data. Ads managed here are billed to the ad account under LinkedIn's
advertising agreement. Demographic pivots that use Microsoft Bing location data
(`MEMBER_COUNTRY_V2`, `MEMBER_REGION_V2`) are also subject to the Microsoft Bing Maps terms.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo-mono.svg | The `[in]` bug in the header of [linkedin.com](https://www.linkedin.com/) (`nav-logo--inbug` icon, served from `https://static.licdn.com/aero-v1/sc/h/4zqr0f9jf98vi2nkijyc3bex2`, fetched 2026-10-17) | removed the two `fill="currentColor"` attributes; paths unchanged |

TODO: no official colour logo that meets the rules (SVG, or PNG of at least 1024x1024) was found,
so `assets/logo.svg` is not shipped. Searched: the LinkedIn Brand Guidelines download page
(https://brand.linkedin.com/downloads): `in-logo.zip` has only PNGs (`LI-In-Bug.png` 635x540,
`InBug-Black.png` and `InBug-White.png` 840x779) and `linkedin-logo.zip` only wordmark PNGs
(2212x540); the brand logo page (https://brand.linkedin.com/linkedin-logo) shows PNG previews
only; linkedin.com's favicon is a 16-24 px ICO, its web manifest has no icons and its header
SVGs carry no colour (the page styles them). Recolouring the header SVG would be guesswork,
which the logo rules forbid. LinkedIn's brand guidelines also ask for written permission for
uses outside them, so a colour logo needs a human decision.
