# Google Analytics

Lets an agent work with Google Analytics 4 (GA4): run reports and realtime reports, read the
dimensions and metrics a property offers, and manage properties and data streams. It calls the
Google Analytics Data API (`v1beta`) for reports and the Google Analytics Admin API (`v1beta`)
for accounts, properties and streams, through the `googleapis` client, with the OAuth token of
the connected Google account.

Limits:

- GA4 only. Universal Analytics properties are not supported.
- `batch-run-reports` runs at most 5 reports per call. `run-realtime-report` covers the last
  30 minutes.
- `delete-property` moves a property to the trash; Google keeps it there for a limited time,
  after which it is gone.
- Google applies quotas per property to the Data API; pass `returnPropertyQuota: true` to
  `run-report` to see what is left.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-accounts` | Lists the GA4 accounts the user can reach. | no |
| `list-properties` | Lists the properties of an account. | no |
| `get-property` | Returns one property's details. | no |
| `list-data-streams` | Lists a property's web, iOS and Android data streams. | no |
| `get-data-stream` | Returns one data stream. | no |
| `get-metadata` | Lists the dimensions and metrics a property offers, custom ones included. | no |
| `run-report` | Runs a report with metrics, dimensions, date ranges, filters and ordering. | no |
| `batch-run-reports` | Runs up to 5 reports on one property in one call. | no |
| `run-realtime-report` | Runs a report on the last 30 minutes of activity. | no |
| `create-property` | Creates a GA4 property under an account. | yes, asks first |
| `update-property` | Changes a property's name, time zone, currency or industry category. | yes, asks first |
| `delete-property` | Moves a property to the trash. | yes, asks first |
| `create-data-stream` | Creates a web, iOS or Android data stream under a property. | yes, asks first |

## Setup

In a Google Cloud project, enable the **Google Analytics Data API** and the **Google Analytics
Admin API**. Create an OAuth client of type *Web application*
(<https://console.cloud.google.com/apis/credentials>) with the redirect URI the Station uses,
`{station URL}/auth/callback`, and add these scopes to the consent screen:
`https://www.googleapis.com/auth/analytics.readonly`,
`https://www.googleapis.com/auth/analytics.edit` and
`https://www.googleapis.com/auth/userinfo.email`.

```bash
agentapps install app.google.analytics analytics
agentapps config app.google.analytics CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
agentapps analytics auth
agentapps analytics tools
agentapps analytics tool list-accounts pageSize:10
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets: one OAuth client for every
installation of the app. `agentapps analytics auth` signs one installation in and stores its
tokens. The tools can see and change what the connected Google user can in Google Analytics.

## Terms of use

Google's own terms apply to everything the app does on your behalf: the Google APIs Terms of
Service at <https://developers.google.com/terms> and the Google Analytics Terms of Service at
<https://marketingplatform.google.com/about/analytics/terms/us/>. The Data API's quotas are
described at <https://developers.google.com/analytics/devguides/reporting/data/v1/quotas>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Google's
brand resources or its own site). They have been in the repository since before this README
existed and their origin was not written down.
