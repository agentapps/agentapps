# PostHog

Lets an agent read product analytics from one PostHog project and make a few changes to it:
events, persons, feature flags, insights, cohorts, actions, dashboards, experiments, session
recordings and annotations. It uses the PostHog REST API at
`https://app.posthog.com/api/projects/{PROJECT_ID}` with a personal API key. The host is fixed,
so the app cannot reach a PostHog instance on another host, and one configuration covers one
project.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-events` | Lists the most recent events (10 by default). | no |
| `get-event` | Returns one event by id. | no |
| `list-persons` | Lists person profiles. | no |
| `get-person` | Returns one person by id. | no |
| `list-feature-flags` | Lists the project's feature flags with their status and rollout. | no |
| `get-feature-flag` | Returns one feature flag by id. | no |
| `create-feature-flag` | Creates a feature flag with a key, a name and optional rollout filters. | yes, asks first |
| `update-feature-flag` | Changes the given fields of a feature flag. | yes, asks first |
| `list-insights` | Lists saved insights (trends, funnels, retention, paths). | no |
| `list-cohorts` | Lists the project's cohorts. | no |
| `create-annotation` | Adds an annotation that marks a point in time on charts. | yes, asks first |
| `list-actions` | Lists the project's actions. | no |
| `create-action` | Creates an action from one or more event-matching steps. | yes, asks first |
| `list-dashboards` | Lists the project's dashboards. | no |
| `get-dashboard` | Returns one dashboard by id. | no |
| `list-experiments` | Lists the project's experiments (A/B tests). | no |
| `get-experiment` | Returns one experiment by id. | no |
| `list-session-recordings` | Lists recent session recordings. | no |

Limits:

- The app deletes nothing.
- Requests are not retried.

## Setup

```bash
agentapps install app.posthog posthog
agentapps config app.posthog API_KEY:<personal API key> PROJECT_ID:<project id>
agentapps posthog tools
agentapps posthog tool list-events limit:5
```

`API_KEY` and `PROJECT_ID` are system secrets: every installation of the app uses the same key
and the same project. Create the personal API key at
<https://app.posthog.com/settings/user-api-keys>; the project id is in the project's settings.

## Terms of use

PostHog's own terms apply to everything the app does on your behalf: <https://posthog.com/terms>.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | <https://brand.posthog.com/logo/posthog-logomark.svg> | none |
| assets/logo-mono.svg | <https://brand.posthog.com/logo/posthog-logomark-black.svg> | colour replaced by `currentColor` so a host can tint it |

PostHog's [brand assets](https://brand.posthog.com/logo) are under the PolyForm Strict License 1.0.0, which does not license commercial use or distribution, and ask not to use the logomark alone except at small sizes. Nobody has asked PostHog for permission.
