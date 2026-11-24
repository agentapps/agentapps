# Railway

Lets an agent manage a Railway account: projects, environments, services, variables, domains,
volumes and deployments, including build and runtime logs. It uses Railway's public GraphQL API
(`https://backboard.railway.com/graphql/v2`) with an account token.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `get-user` | Returns the token's user and the workspaces it can use. | no |
| `list-workspaces` | Lists the workspaces the user can use. | no |
| `list-projects` | Lists the account's projects. | no |
| `get-project` | Returns one project with its services and environments. | no |
| `create-project` | Creates a project in a workspace. | yes, asks first |
| `delete-project` | Deletes a project. It cannot be undone. | yes, asks first |
| `list-environments` | Lists a project's environments. | no |
| `create-environment` | Creates an environment in a project. | yes, asks first |
| `list-services` | Lists a project's services. | no |
| `create-service` | Creates a service in a project. | yes, asks first |
| `delete-service` | Deletes a service. | yes, asks first |
| `list-variables` | Lists a service's environment variables in one environment, with sensitive values masked. | no |
| `set-variables` | Sets environment variables for a service in one environment. | yes, asks first |
| `list-deployments` | Lists a service's recent deployments in one environment. | no |
| `get-deployment` | Returns the status of one deployment. | no |
| `redeploy` | Redeploys an existing deployment. | yes, asks first |
| `list-domains` | Lists a service's domains in one environment. | no |
| `create-domain` | Creates a Railway-generated domain for a service. | yes, asks first |
| `connect-repo` | Connects a GitHub repository to a service, which starts a deployment. | yes, asks first |
| `deploy-public-repo` | Creates a service from a public GitHub repository and deploys it. | yes, asks first |
| `create-volume` | Creates a persistent volume for a service. | yes, asks first |
| `get-build-logs` | Returns a deployment's build logs (100 lines by default, 500 at most). | no |
| `get-deploy-logs` | Returns a deployment's runtime logs. | no |

Limits:

- `list-variables` hides the value of a variable whose name contains `secret`, `password`,
  `token` or `key`, and cuts other values at 50 characters. A secret under another name is
  shown.
- `connect-repo` reaches a private repository only when GitHub is connected in the Railway
  account. `deploy-public-repo` works with public repositories only.

## Setup

```bash
agentapps install app.railway railway
agentapps config railway RAILWAY_TOKEN:<your token>
agentapps railway tools
agentapps railway tool list-projects
```

`RAILWAY_TOKEN` is an installation secret: each installation uses its own token. Create it at
<https://railway.app/account/tokens>.

## Terms of use

Railway's own terms apply to everything the app does on your behalf:
<https://railway.com/legal/terms>. Services, volumes and deployments the agent creates are
billed by Railway to the account that owns the token.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Railway's press
kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
