# Amplitude

Lets an agent read analytics from an Amplitude project: event segmentation, funnels, retention,
revenue, active users, user activity, cohorts, charts and the event taxonomy. It can also create
and delete chart annotations. It uses Amplitude's HTTP APIs at `https://amplitude.com/api/2` and
`https://analytics.amplitude.com/api/3`, with the project's API key and secret key.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `query-events` | Returns event segmentation data: counts and breakdowns of an event in a date range. | no |
| `get-funnel` | Returns step-by-step conversion for a sequence of events. | no |
| `get-retention` | Returns retention for users who did a start event and then a return event. | no |
| `get-user-activity` | Returns the recent events of one user. | no |
| `list-cohorts` | Lists the project's cohorts. | no |
| `get-cohort` | Returns one cohort by id. | no |
| `export-events` | Exports raw events for a range of hours. | no |
| `get-annotations` | Lists chart annotations. | no |
| `create-annotation` | Creates a chart annotation on a date. | yes, asks first |
| `delete-annotation` | Deletes a chart annotation by id. | yes, asks first |
| `list-charts` | Lists the project's charts. | no |
| `get-chart` | Returns one chart by id. | no |
| `search-users` | Searches users by user id, device id or another identifier. | no |
| `get-revenue` | Returns revenue lifetime value data for a date range. | no |
| `list-event-types` | Lists the event types of the project. | no |
| `get-active-users` | Returns active or new user counts for a date range. | no |

Limits:

- The two API hosts are fixed in the code. A project stored in another Amplitude data region is
  not reachable.
- The app does not send events to Amplitude and does not change cohorts or charts.
- Requests are not retried.

## Setup

```bash
agentapps install app.amplitude amplitude
agentapps config app.amplitude API_KEY:<your API key>
agentapps config app.amplitude SECRET_KEY:<your secret key>
agentapps amplitude tools
agentapps amplitude tool get-active-users start:20260101 end:20260131
```

`API_KEY` and `SECRET_KEY` are system secrets: one pair for every installation of the app, so
every installation reads the same Amplitude project. Amplitude shows both in the project's
settings (Organization settings, Projects, then the project).

## Terms of use

Amplitude's own terms apply to everything the app does on your behalf:
<https://amplitude.com/terms>.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | "Amplitude Logo.zip", linked from <https://brand.amplitude.com/creative/logo>, the blue mark | removed the XML declaration |
| assets/logo-mono.svg | same kit, the black mark | removed the XML declaration and the `<style>` element; the one colour replaced by `currentColor` so a host can tint it |
