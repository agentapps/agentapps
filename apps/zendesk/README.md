# Zendesk

Lets an agent work in a Zendesk Support account through the Zendesk REST API v2
(`https://<subdomain>.zendesk.com/api/v2`): tickets and their comments and attachments, users,
organizations, views, groups and satisfaction ratings, plus read-only lists of triggers,
automations and webhooks. Each installation uses its own subdomain, email and API token, so it
acts as that Zendesk user with that user's role. Only reads are retried on a rate limit or a
server error; a create, update or delete is never retried, so a failed call may need to be
repeated by hand. Lists return 30 rows by default and 100 at most.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-tickets` | Lists tickets, optionally filtered by status, priority, assignee, requester or organization. | no |
| `get-ticket` | Returns one ticket with its description, custom fields and tags. | no |
| `create-ticket` | Creates a ticket. | yes, asks first |
| `update-ticket` | Changes the given fields of a ticket. | yes, asks first |
| `delete-ticket` | Soft-deletes a ticket. | yes, asks first |
| `search-tickets` | Searches tickets with Zendesk's search syntax, such as `status:open tags:urgent`. | no |
| `list-ticket-comments` | Lists a ticket's public comments and internal notes. | no |
| `add-ticket-comment` | Adds a public comment or an internal note to a ticket. | yes, asks first |
| `add-comment-with-attachment` | Adds a comment with files uploaded before with `upload-attachment`. | yes, asks first |
| `upload-attachment` | Uploads a local file to Zendesk and returns its upload token. | yes, asks first |
| `get-attachment` | Returns an attachment's name, URL, size and type. | no |
| `list-users` | Lists users, optionally filtered by role or a query. | no |
| `get-user` | Returns one user. | no |
| `create-user` | Creates an end user, agent or admin. | yes, asks first |
| `update-user` | Changes the given fields of a user. | yes, asks first |
| `list-organizations` | Lists organizations. | no |
| `get-organization` | Returns one organization with its domain names and tags. | no |
| `create-organization` | Creates an organization. | yes, asks first |
| `list-views` | Lists views (saved ticket filters). | no |
| `get-view-tickets` | Lists the tickets of a view. | no |
| `list-groups` | Lists groups. | no |
| `list-triggers` | Lists triggers. | no |
| `list-automations` | Lists automations. | no |
| `list-webhooks` | Lists webhooks. | no |
| `list-satisfaction-ratings` | Lists satisfaction ratings, optionally filtered by score. | no |

## Setup

```bash
agentapps install app.zendesk zendesk
agentapps config zendesk SUBDOMAIN:<your subdomain> EMAIL:<your email> API_TOKEN:<your token>
agentapps zendesk tools
agentapps zendesk tool list-tickets status:open limit:5
```

The three are installation secrets: each installation has its own. `SUBDOMAIN` is the first part
of your Zendesk address (`acme` for `acme.zendesk.com`). `EMAIL` is the address of the Zendesk
user the installation acts as. `API_TOKEN` is created by an administrator in the Zendesk Admin
Center, under Apps and integrations, APIs.

## Terms of use

Zendesk's own agreement applies to everything the app does on your behalf. Zendesk publishes its
agreements at <https://www.zendesk.com/company/agreements-and-terms/>. Its API rate limits are
described at <https://developer.zendesk.com/api-reference/introduction/rate-limits/>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Zendesk's
press kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
