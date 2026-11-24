# Metricool

Lets an agent plan posts and read analytics through one [Metricool](https://metricool.com)
account: schedule posts and save drafts on the networks connected to a brand, see what is in
the planner, delete posts, and read metric time series, published posts with their metrics and
the best times to post. It uses the
[Metricool API](https://app.metricool.com/resources/apidocs/index.html). Metricool holds the
connection to each network (X, Facebook, Instagram, LinkedIn, TikTok, YouTube and more), so the
app needs the account's API token and user id.

**Not tested against the real service yet.** The app was written from Metricool's OpenAPI
document and its own MCP server, with mocked tests only: no Metricool account with API access
was available. Expect the first live run to find differences (see
[the spec's open questions](../../docs/specs/metricool.md#open-questions)).

Limits: the API is part of Metricool's paid plans, not the free one; brands and network
connections are managed in the Metricool UI, not here; media is given as public URLs; a post
cannot be edited once created (delete it and create it again); there is no "publish now", a
post always has a date.

Spec: [`docs/specs/metricool.md`](../../docs/specs/metricool.md).

## Tools

Every tool except `list-brands` takes `brandId`, the brand it works on.

| Tool | What it does | Writes? |
|---|---|---|
| `list-brands` | The brands of the account, with their id, timezone and connected networks. | no |
| `list-posts` | Drafts, scheduled and published posts of the planner in a date range. | no |
| `get-post` | One post of the planner in full. | no |
| `get-best-times` | The best hours to publish on a network, per day of the week. | no |
| `get-metric-timeline` | The time series of one metric of one network. | no |
| `list-published-posts` | What a network published in a date range, with metrics per item. | no |
| `create-draft` | Saves a draft in the planner; nothing is published. | yes, asks first |
| `schedule-post` | Schedules a post; Metricool publishes it at the date. | yes, asks first (destructive) |
| `delete-post` | Deletes a draft or a scheduled post. | yes, asks first (destructive) |

`schedule-post` is destructive because a published post is public and the app cannot take it
back.

### Dates

Dates are local date-times without an offset, `2026-12-01T09:00:00`, and the timezone goes in
its own `timezone` argument as an IANA name (`Europe/Madrid`). `list-brands` gives the timezone
of each brand.

### Network data

`schedule-post` and `create-draft` take an optional `networkData` object, sent to Metricool
unchanged. Its keys are `<network>Data`: `instagramData` (`type`: `POST`, `REEL` or `STORY`),
`facebookData`, `linkedinData`, `youtubeData` (needs `title` and `madeForKids`),
`pinterestData` (needs `boardId`), `tiktokData` and the rest. The `ScheduledPost` schema of the
[OpenAPI document](https://app.metricool.com/api/swagger.json) lists every field.

## Setup

```bash
agentapps install app.metricool metricool
agentapps config metricool METRICOOL_USER_TOKEN:"<token>" METRICOOL_USER_ID:"<user id>"
agentapps metricool tools
agentapps metricool tool list-brands
agentapps metricool tool list-posts brandId:123456 start:2026-12-01T00:00:00 end:2026-12-31T23:59:59 timezone:Europe/Madrid
```

Installation secrets are per installation: set them on the alias (`metricool` above), not on `app.metricool`.

- `METRICOOL_USER_TOKEN`: the API token of your Metricool account, from Account Settings > API.
  It has no scopes: it can do everything the account can.
- `METRICOOL_USER_ID`: the user id of the same account, shown next to the token. It is a
  number.

## Terms of use

Use of the API is covered by Metricool's
[legal terms](https://metricool.com/legal-terms/). The API is available on paid plans only, and
Account Settings > API shows the usage of the account. The API reference states no rate limit;
the app retries a read at most twice and never repeats a write.

## Logos

Changed on 2026-11-23, asked for by the project owner. `assets/logo.svg` carried a `prefers-color-scheme: dark` rule that painted it white, so it vanished on a light surface for a reader in dark mode. The rule is removed; the logo keeps its `rgb(61,61,61)`.

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | The icon the Metricool app declares as its own (`<link rel="icon">` of <https://app.metricool.com/>): <https://static.metricool.com/resources/img/metricool-logo.svg> | removed the `<?xml ?>` declaration and the `DOCTYPE` line |
| assets/logo-mono.svg | same file | also removed its `<style>` element (the fill colours); the path is unchanged |

The official icon is a single-colour mark (dark grey, white in dark mode), so the branded logo
has no other colours. metricool.com has no press kit or brand page: `/press-kit/`,
`/brand-assets/`, `/brand-guidelines/`, `/logos/` and `/prensa/` answer 404, and `/media-kit/`,
`/brand/` and `/press/` lead to blog articles.
