# Mixpanel

Lets an agent read analytics from one Mixpanel project: event names and volumes, segmentation,
funnels, retention, cohorts, dashboards, user profiles and raw events. It calls the Mixpanel
Query API (`https://mixpanel.com/api/query`) and the raw export API
(`https://data.mixpanel.com/api/2.0`) as a service account. Every tool is read-only: the app does
not track events or change anything in Mixpanel. Both hosts are fixed in the code, and no call is
retried.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `get-event-names` | Lists the names of the events the project tracks. | no |
| `get-top-events` | Returns the events with the most volume. | no |
| `query-events` | Returns counts for one event in a date range. | no |
| `get-segmentation` | Returns counts for one event in a date range, broken down by a property. | no |
| `get-property-values` | Returns the most common values of one property of an event. | no |
| `list-funnels` | Lists the saved funnels. | no |
| `get-funnel` | Returns step-by-step conversion for one funnel in a date range. | no |
| `get-retention` | Returns cohort retention in a date range. | no |
| `list-cohorts` | Lists the saved cohorts. | no |
| `get-cohort` | Returns one cohort by id. | no |
| `list-dashboards` | Lists the project's dashboards. | no |
| `get-user-profile` | Returns one user profile by `distinct_id`. | no |
| `export-events` | Exports raw events in a date range, optionally for one event name. | no |

Dates are `YYYY-MM-DD`.

## Setup

```bash
agentapps install app.mixpanel mixpanel
agentapps config app.mixpanel PROJECT_ID:<project id>
agentapps config mixpanel SERVICE_ACCOUNT_USERNAME:<username> SERVICE_ACCOUNT_SECRET:<secret>
agentapps mixpanel tools
agentapps mixpanel tool get-top-events limit:10
```

- `PROJECT_ID` is a system secret: every installation of the app reads the same project. It is
  the numeric id shown in the project's settings in Mixpanel.
- `SERVICE_ACCOUNT_USERNAME` and `SERVICE_ACCOUNT_SECRET` are installation secrets. Create a
  service account in Mixpanel's organization or project settings and give it access to the
  project. Mixpanel shows the secret only once.

## Terms of use

Mixpanel's own terms apply to everything the app does on your behalf:
<https://mixpanel.com/legal/terms-of-use/>. TODO: note here the API rate limits that matter to
someone installing the app; none was checked for this README.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | <https://brand.mixpanel.com/assets/logos/logo-mark-purple.svg> | none |
| assets/logo-mono.svg | <https://brand.mixpanel.com/assets/logos/logo-mark.svg> | the one colour replaced by `currentColor` so a host can tint it |
