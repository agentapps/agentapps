# Vercel

Lets an agent manage a Vercel account through the Vercel REST API (`https://api.vercel.com`):
read projects, deployments, build logs, domains, aliases, environment variables and teams, add a
domain to a project, create and delete environment variables, and cancel or redeploy a
deployment. Each installation uses its own access token, so it acts as that Vercel user. The
tools take no team parameter. Requests are not retried.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-projects` | Lists projects, optionally filtered by a search term. | no |
| `get-project` | Returns one project by name or id. | no |
| `list-deployments` | Lists deployments, optionally filtered by project, state and target. | no |
| `get-deployment` | Returns one deployment by id or URL. | no |
| `list-domains` | Lists the account's domains. | no |
| `get-domain` | Returns one domain. | no |
| `add-domain` | Adds a domain to a project. | yes, asks first |
| `list-env-vars` | Lists a project's environment variables. | no |
| `create-env-var` | Creates an environment variable for a project and its targets. | yes, asks first |
| `delete-env-var` | Deletes an environment variable by its id. | yes, asks first |
| `list-teams` | Lists the teams the user belongs to. | no |
| `get-deployment-events` | Returns a deployment's build log events. | no |
| `cancel-deployment` | Cancels a deployment that is building or queued. | yes, asks first |
| `redeploy` | Creates a new deployment from an existing one. | yes, asks first |
| `list-aliases` | Lists aliases, optionally of one project. | no |

## Setup

```bash
agentapps install app.vercel vercel
agentapps config vercel API_TOKEN:<your token>
agentapps vercel tools
agentapps vercel tool list-projects limit:5
```

`API_TOKEN` is an installation secret: each installation has its own. Create an access token in
your Vercel account settings, under Tokens (<https://vercel.com/account/tokens>).

## Terms of use

Vercel's own terms apply to everything the app does on your behalf:
<https://vercel.com/legal/terms>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Vercel's press
kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
