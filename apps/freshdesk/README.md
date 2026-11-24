# Freshdesk

Lets an agent work a Freshdesk helpdesk: list, search, create, update and delete tickets, read
a ticket's conversations and time entries, reply to a ticket or add a note, and list or create
contacts and companies, plus list agents and groups. It calls the Freshdesk REST API v2 at
`https://<your domain>.freshdesk.com/api/v2` with an agent's API key.

Limits:

- Lists are paged with `page` and `per_page`; `list-tickets` returns 30 per page by default
  and 100 at most. `search-tickets` returns at most 30 results per page.
- `reply-to-ticket` sends a public reply that the requester receives. `add-note-to-ticket`
  writes a private note unless `private` is `false`.
- Calls are not retried and have no deadline of their own.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-tickets` | Lists tickets, filtered by status or priority, with paging. | no |
| `get-ticket` | Returns one ticket by id. | no |
| `search-tickets` | Searches tickets with a Freshdesk query such as `"status:2 AND priority:3"`. | no |
| `create-ticket` | Creates a ticket from a subject, a description and the requester's email. | yes, asks first |
| `update-ticket` | Changes a ticket's status, priority, subject or description. | yes, asks first |
| `delete-ticket` | Deletes a ticket. | yes, asks first |
| `list-ticket-conversations` | Lists the replies and notes of a ticket. | no |
| `reply-to-ticket` | Sends a public reply on a ticket. | yes, asks first |
| `add-note-to-ticket` | Adds a note to a ticket, private by default. | yes, asks first |
| `list-time-entries` | Lists the time entries of a ticket. | no |
| `list-contacts` | Lists contacts, filtered by email, phone or mobile. | no |
| `get-contact` | Returns one contact by id. | no |
| `create-contact` | Creates a contact. | yes, asks first |
| `list-companies` | Lists companies. | no |
| `get-company` | Returns one company by id. | no |
| `create-company` | Creates a company. | yes, asks first |
| `list-agents` | Lists agents, optionally filtered by email. | no |
| `list-groups` | Lists agent groups. | no |

## Setup

```bash
agentapps install app.freshdesk freshdesk
agentapps config freshdesk DOMAIN:<your subdomain> API_KEY:<your key>
agentapps freshdesk tools
agentapps freshdesk tool list-tickets per_page:5
```

`DOMAIN` and `API_KEY` are installation secrets: each installation has its own. `DOMAIN` is the
subdomain only: `mycompany` for `mycompany.freshdesk.com`. The API key is in Freshdesk under
Profile Settings > Your API Key. It acts as the agent it belongs to, so the tools can do what
that agent can do.

## Terms of use

Freshworks' own terms apply to everything the app does in your helpdesk:
<https://www.freshworks.com/terms/>. TODO: note here the API rate limit of your Freshdesk plan
if it matters to someone installing the app.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | the Freshdesk icon on <https://www.freshworks.com/freshdesk/>, <https://www.freshworks.com/beta/icons/template-2026/freshdesk-logo-icon.svg> | none |
| assets/logo-mono.svg | the same file | its paths joined into one with `fill-rule="evenodd"`, so the white shapes are cut out of the background instead of painted on it; the colours replaced by `currentColor`. The path data is unchanged. Asked for by the project owner. |

Freshworks has no public press or brand page (`/press/`, `/brand/`, `/brand-assets/`, `/press-kit/`, `/newsroom/` answer 404).
