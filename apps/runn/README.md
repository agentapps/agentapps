# Runn

Lets an agent work with a Runn account for resource planning: projects, people, placeholders,
assignments, actuals (logged hours), clients, roles, teams and skills. It uses the Runn REST API
version 1.0.0 (`https://api.runn.io`) with an API token.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-projects` | Lists projects, optionally by client or archived state. | no |
| `get-project` | Returns one project: client, team, pricing model, budget, tags. | no |
| `create-project` | Creates a project for a client. | yes, asks first |
| `update-project` | Changes the given fields of a project. | yes, asks first |
| `list-people` | Lists people. | no |
| `get-person` | Returns one person. | no |
| `create-person` | Creates a person with a first contract for a role. | yes, asks first |
| `list-placeholders` | Lists placeholders (role slots planned before a person is assigned). | no |
| `create-placeholder` | Creates a placeholder for a role. | yes, asks first |
| `list-assignments` | Lists assignments, optionally for one person or one project. | no |
| `create-assignment` | Assigns a person or placeholder to a project, at a role, over a date range. | yes, asks first |
| `delete-assignment` | Deletes an assignment. It cannot be undone. | yes, asks first |
| `list-actuals` | Lists actuals (hours logged per day), optionally for one person or one project. | no |
| `create-actual` | Logs the minutes worked on a day. It overwrites an actual that already exists for the same day, person, project and role. | yes, asks first |
| `list-clients` | Lists clients. | no |
| `create-client` | Creates a client. | yes, asks first |
| `list-roles` | Lists roles. | no |
| `list-teams` | Lists teams. | no |
| `list-skills` | Lists skills. | no |
| `get-project-totals` | Returns billable, non-billable and total minutes per project (10 projects per page at most). | no |

Limits:

- Lists return 50 items by default and 200 at most, with a cursor for the next page.
- Only reads are retried on a transient error (three times). A write is never retried: Runn has
  no idempotency key, so a repeated create could duplicate the record.
- A read-only token cannot write.

## Setup

```bash
agentapps install app.runn runn
agentapps config runn API_KEY:<your token>
agentapps runn tools
agentapps runn tool list-projects limit:5
```

`API_KEY` is an installation secret: each installation uses its own Runn API token. Create it
in Runn's account settings, under API, with write access if the agent should create or change
anything.

## Terms of use

Runn's own terms apply to everything the app does on your behalf: <https://www.runn.io/terms>.

## Logos

Changed on 2026-11-23, asked for by the project owner. `assets/logo.svg` and `assets/logo-mono.svg` were the icon with the name next to it. Both are now the icon alone: the same path, with the name's path left out and the `viewBox` set to the icon's bounds.

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Runn's press
kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down. `assets/logo.png` (512x512) is also in
the repository; the manifest does not use it because a PNG logo must be 1024x1024 or larger.
