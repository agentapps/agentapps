# Render

Lets an agent manage a Render account: projects, environments, services, deploys, environment
variables, custom domains, disks and logs. It uses the Render REST API
(`https://api.render.com/v1`) with an API key.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `get-user` | Returns the key's user (id, name, email). | no |
| `list-owners` | Lists the workspaces (personal and team) the key can use. | no |
| `list-projects` | Lists the account's projects. | no |
| `get-project` | Returns one project. | no |
| `create-project` | Creates a project for an owner. | yes, asks first |
| `delete-project` | Deletes a project. It cannot be undone. | yes, asks first |
| `list-environments` | Lists a project's environments. | no |
| `create-environment` | Creates an environment in a project. | yes, asks first |
| `list-services` | Lists services, optionally by type or name. | no |
| `get-service` | Returns one service. | no |
| `create-service` | Creates a service from a GitHub repository. | yes, asks first |
| `delete-service` | Deletes a service. It cannot be undone. | yes, asks first |
| `suspend-service` | Suspends a running service. | yes, asks first |
| `resume-service` | Resumes a suspended service. | yes, asks first |
| `restart-service` | Restarts a running service. | yes, asks first |
| `list-deploys` | Lists a service's recent deploys (10 by default, 100 at most). | no |
| `get-deploy` | Returns the status and details of one deploy. | no |
| `trigger-deploy` | Starts a new deploy, optionally clearing the build cache. | yes, asks first |
| `cancel-deploy` | Cancels a running deploy. | yes, asks first |
| `rollback-deploy` | Rolls a service back to an earlier deploy. | yes, asks first |
| `list-env-vars` | Lists a service's environment variables, with sensitive values masked. | no |
| `set-env-vars` | Replaces all of a service's environment variables with the given ones. | yes, asks first |
| `update-env-var` | Adds or changes one environment variable. | yes, asks first |
| `delete-env-var` | Deletes one environment variable. | yes, asks first |
| `list-custom-domains` | Lists a service's custom domains. | no |
| `add-custom-domain` | Adds a custom domain to a service. | yes, asks first |
| `delete-custom-domain` | Removes a custom domain from a service. | yes, asks first |
| `verify-custom-domain` | Asks Render to verify a custom domain's DNS. | yes, asks first |
| `list-disks` | Lists a service's persistent disks. | no |
| `add-disk` | Adds a persistent disk to a service. | yes, asks first |
| `get-logs` | Returns recent logs of one or more services (100 by default, 500 at most). | no |

Limits:

- `set-env-vars` removes every variable that is not in the call. Use `update-env-var` to change
  one.
- Only reads are retried on a transient error (twice). A write is never retried, so a failed
  call may need to be repeated by hand.

## Setup

```bash
agentapps install app.render render
agentapps config render RENDER_API_KEY:<your key>
agentapps render tools
agentapps render tool list-services type:web_service
```

`RENDER_API_KEY` is an installation secret: each installation uses its own key. Create it at
<https://dashboard.render.com/u/settings#api-keys>.

## Terms of use

Render's own terms apply to everything the app does on your behalf: <https://render.com/terms>.
Services and disks the agent creates are billed by Render to the account that owns the key.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Render's press
kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
