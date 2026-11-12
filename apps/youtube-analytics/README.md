# YouTube Analytics

Lets an agent read the analytics of your own YouTube channel: views, watch time, average view
duration, subscribers gained and lost, likes, comments and shares, broken down by day, month,
country, content type, traffic source, device or operating system; top videos; audience
retention per video; viewer age and gender; and the channel's videos and playlists. It uses the
[YouTube Analytics API](https://developers.google.com/youtube/analytics) (`reports.query`) and the
read parts of the [YouTube Data API v3](https://developers.google.com/youtube/v3), with Google
OAuth 2.0. The app only reads: no tool changes anything on YouTube.

Limits: only channels the connected Google account owns or manages; no revenue or ad metrics
(see [Scopes](#scopes)); no content-owner (CMS) reports; YouTube data for the last 2-3 days is
usually incomplete; reports use Pacific time.

## Tools

All tools are read-only: `readOnlyHint: true`, `destructiveHint: false`,
`idempotentHint: true`, `openWorldHint: true`, `sensitive: false`.

| Tool | What it does | Writes? |
|---|---|---|
| `list-channels` | The account's channels: id, title, handle, subscribers, views, video count, uploads playlist | no |
| `get-channel-report` | Channel metrics for a date range, as totals or by day, month, country, content type, traffic source, device type or operating system | no |
| `get-video-report` | The same breakdowns for one video | no |
| `get-top-videos` | Best videos in a range by views, watch time or subscribers, with titles (max 50) | no |
| `get-audience-retention` | Retention curve of one video (watch ratio and relative performance per point), filterable by audience type and subscription | no |
| `get-demographics` | Viewer percentage by age group and/or gender, for the channel or a video | no |
| `run-report` | Any `reports.query` the focused tools do not cover (custom metrics, dimensions, filters, sort, paging) | no |
| `list-videos` | The channel's uploads, newest first, with lifetime stats (3 quota units per page) | no |
| `search-videos` | Keyword search over the account's own videos (100 quota units per call) | no |
| `get-videos` | Details and lifetime stats of up to 50 videos by id | no |
| `list-playlists` | The channel's playlists with item counts | no |
| `list-playlist-videos` | The videos in a playlist, in order | no |

Report dates are `YYYY-MM-DD`; when omitted the window is the last 28 days ending today. Daily
series are capped at 400 days (use `groupBy: "month"`), and every result stays under 50,000
characters (`limitApplied` and `nextStartIndex` say when rows were cut).

## Setup

You need a Google Cloud OAuth client (shared by every installation, set once as system secrets)
and then each user connects their own Google account (installation secrets, written by the OAuth flow).

### 1. Google Cloud project (once)

1. In the [Google Cloud console](https://console.cloud.google.com/), create or pick a project.
2. Enable the **YouTube Analytics API** and the **YouTube Data API v3**
   (APIs & Services > Library).
3. Configure the **OAuth consent screen** (Google Auth Platform > Branding / Audience / Data
   access) and add these scopes:
   - `https://www.googleapis.com/auth/yt-analytics.readonly`
   - `https://www.googleapis.com/auth/youtube.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`

   The two YouTube scopes are *sensitive* scopes. While the app's publishing status is
   **Testing**, only the test users you list can connect, and Google expires their refresh
   tokens after 7 days (they reconnect with `agentapps <alias> auth reauth`). For other users,
   publish the app and complete Google's OAuth app verification.
4. Create an **OAuth client ID** of type *Web application* (Credentials > Create credentials).
   Add your station's callback as an authorized redirect URI: `<station publicUrl>/auth/callback`,
   for example `https://your-station.example.com/auth/callback`.
5. Note the client id and client secret.

No API key, developer token or account id is needed. The Data API has a default quota of
10,000 units a day per Cloud project: most calls cost 1 unit, `search-videos` costs 100. The
Analytics API has its own separate quota.

### 2. System secrets (once per station)

```bash
agentapps config app.youtube-analytics CLIENT_ID:"<client id>" CLIENT_SECRET:"<client secret>"
# Only if agentapps.json has no "station": { "publicUrl": ... }:
agentapps config app.youtube-analytics REDIRECT_URI:"https://your-station.example.com/auth/callback"
```

The station uses them for the code exchange and for refreshing tokens; the app process never
reads the client secret. `agentapps install` lists `REDIRECT_URI` as missing until it is set;
with a station `publicUrl` it is not needed for the OAuth flow.

### 3. Install and connect an account (per user)

```bash
agentapps install app.youtube-analytics youtube
agentapps youtube auth                      # opens Google's consent screen
agentapps youtube tool list-channels
agentapps youtube tool get-channel-report groupBy:day startDate:2026-09-01 endDate:2026-09-30
agentapps youtube tool get-top-videos orderBy:estimatedMinutesWatched maxResults:10
```

The OAuth flow stores the installation secrets on the installation (the alias, `youtube` above):
`ACCESS_TOKEN`, `REFRESH_TOKEN` and `EXPIRY_DATE` (`EMAIL` is declared for hosts that record
it; the app does not need it). You do not type them. To set them by hand on a host without the
OAuth flow (for example with tokens from the OAuth Playground using your own client), use the
alias, never the app id:

```bash
agentapps config youtube ACCESS_TOKEN:"<access token>" REFRESH_TOKEN:"<refresh token>" EXPIRY_DATE:"2026-10-17T12:00:00Z"
```

An expired access token is refreshed through the host and replayed once. When the refresh
token is dead the tools say `[AUTH_EXPIRED]`: run `agentapps youtube auth reauth`.

The app only works with channels the connected account owns or manages. For a channel owned
by a Brand Account, connect with the Google identity that manages it and pick the channel on
Google's account chooser; `list-channels` shows what the token can see. Pass another owned
channel's `UC...` id as `channelId`.

## Scopes

- `yt-analytics.readonly`: every report tool.
- `youtube.readonly`: channels, videos, playlists and search (Data API); the `reports.query`
  reference also lists it as required.
- `userinfo.email`: lets the host show which Google account is connected.

`yt-analytics-monetary.readonly` (estimated revenue, CPM, ad impressions) is deliberately **not**
requested: revenue only exists for channels in the YouTube Partner Program, it is the most
sensitive data a channel has, and least privilege keeps the consent screen and Google's
verification simpler. Adding it later means a new scope, re-consent for every user, and a
revenue tool. Until then a revenue metric in `run-report` gets a 403 from the API.

## Terms of use

Using this app means using the YouTube API Services, so the
[YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service),
the [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
and the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
apply to whoever operates the OAuth client. In particular: users must agree to the
[YouTube Terms of Service](https://www.youtube.com/t/terms) and be pointed to the
[Google Privacy Policy](https://policies.google.com/privacy); users can revoke access at
[Google account permissions](https://myaccount.google.com/permissions); quota above the default
needs Google's compliance audit. The app keeps no data: every call reads live from the API, and
nothing is cached or stored by the app.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | YouTube brand resources, [brand.youtube/youtube-icon](https://brand.youtube/youtube-icon), "Download icon" kit `youtube-icon.zip`, `YouTube_Icon/Digital/01 Red/yt_icon_red_digital.ai` | The kit has no SVG: converted the official vector `.ai` (PDF-compatible) to SVG with `pdftocairo -svg` (poppler 26.09), paths unchanged; removed the `<?xml ...?>` line |
| assets/logo-mono.svg | same kit, `YouTube_Icon/Digital/02 Almost Black/yt_icon_almostblack_digital.ai` (the official one-colour variant) | Same conversion; removed the `<?xml ...?>` line and the `fill` / `fill-opacity` attributes so the host can tint it. The play triangle is a cut-out in the official path, so it stays visible |
