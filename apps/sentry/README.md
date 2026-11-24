# Sentry

Lets an agent follow errors in Sentry through its Web API (`https://sentry.io/api/0`): list
organizations, projects, teams, issues, events, releases and alert rules, read an issue or an
event with its stack trace, resolve, ignore or assign an issue, and create a release. The host
is fixed to `sentry.io`.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-organizations` | Lists the organizations the token can see. | no |
| `list-projects` | Lists an organization's projects. | no |
| `get-project` | Returns one project. | no |
| `list-issues` | Lists issues, optionally for one project and with a search query (25 by default). | no |
| `get-issue` | Returns one issue. | no |
| `list-events` | Lists the events (single occurrences) of an issue. | no |
| `get-event` | Returns one event with its full stack trace. | no |
| `resolve-issue` | Marks an issue as resolved. | yes, asks first |
| `ignore-issue` | Ignores an issue, which stops its notifications. | yes, asks first |
| `assign-issue` | Assigns an issue to a user or a team. | yes, asks first |
| `list-releases` | Lists an organization's releases, optionally for one project. | no |
| `get-release` | Returns one release by version. | no |
| `create-release` | Creates a release for one or more projects. | yes, asks first |
| `list-teams` | Lists an organization's teams. | no |
| `list-alerts` | Lists a project's alert rules. | no |

Limits:

- Tools that take `organization` use the `ORGANIZATION` secret when the argument is left out.
- The app deletes nothing.

## Setup

```bash
agentapps install app.sentry sentry
agentapps config app.sentry API_KEY:<auth token> ORGANIZATION:<organization slug>
agentapps sentry tools
agentapps sentry tool list-projects
```

`API_KEY` and `ORGANIZATION` are system secrets: every installation of the app uses the same
token and the same default organization. `API_KEY` is a Sentry auth token; create it at
<https://sentry.io/settings/account/api/auth-tokens/>.

## Terms of use

Sentry's own terms apply to everything the app does on your behalf: <https://sentry.io/terms/>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Sentry's press
kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
