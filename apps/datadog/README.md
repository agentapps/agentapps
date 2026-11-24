# Datadog

Lets an agent read monitoring data from a Datadog account and make two changes to monitors. It
queries metrics, searches logs, and lists monitors, dashboards, incidents and downtimes; it can
also create a monitor and mute one. It calls the Datadog API (v1 and v2 endpoints) at
`https://api.datadoghq.com` with an API key and an application key.

Limits:

- The address is fixed: only accounts on the `datadoghq.com` site can be reached. Accounts on
  another Datadog site (for example `datadoghq.eu`) are not supported.
- `search-logs` returns 10 log events by default and 1000 at most.
- Calls are not retried and have no deadline of their own.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `query-metrics` | Queries time-series metrics with a metric query and a time range in epoch seconds. | no |
| `search-logs` | Searches log events by query and time range, with a limit and a sort order. | no |
| `list-monitors` | Lists monitors, filtered by name or tags, with paging. | no |
| `get-monitor` | Returns one monitor by id. | no |
| `create-monitor` | Creates a monitor from a type, a query and a name, with an optional message, tags and priority. | yes, asks first |
| `mute-monitor` | Mutes a monitor, optionally until an end timestamp. | yes, asks first |
| `list-dashboards` | Lists dashboards, optionally limited to a count. | no |
| `get-dashboard` | Returns one dashboard by id. | no |
| `list-incidents` | Lists incidents, with page size and offset. | no |
| `get-incident` | Returns one incident by id. | no |
| `list-downtimes` | Lists scheduled downtimes, optionally only the active ones. | no |

## Setup

```bash
agentapps install app.datadog datadog
agentapps config datadog API_KEY:<your API key> APP_KEY:<your application key>
agentapps datadog tools
agentapps datadog tool list-monitors pageSize:5
```

`API_KEY` and `APP_KEY` are installation secrets: each installation has its own pair. In
Datadog, API keys are under Organization Settings > API Keys and application keys under
Organization Settings > Application Keys
(<https://docs.datadoghq.com/account_management/api-app-keys/>). The application key carries
the permissions of the user who created it, so the tools can do what that user can do.

## Terms of use

Datadog's own terms apply to everything the app does with your account. Its Master
Subscription Agreement is at <https://www.datadoghq.com/legal/msa/>. TODO: note here any API
rate limit that matters to someone installing the app.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Datadog's
press kit, brand guidelines or its own site). They have been in the repository since before
this README existed and their origin was not written down.
