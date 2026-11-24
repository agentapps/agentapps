# Pipedrive

Lets an agent work with a Pipedrive CRM account: list, read, create and update deals, persons,
organizations, activities and notes, and list pipelines and stages. It calls the Pipedrive REST
API v1 (`https://api.pipedrive.com/v1`) with a personal API token, which it sends as the
`api_token` query parameter. Only deals can be deleted, persons cannot be updated, and no call is
retried.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-deals` | Lists deals, filtered by status, stage or owner, with `start` and `limit` paging. | no |
| `get-deal` | Returns one deal by id, with its contacts and organization. | no |
| `create-deal` | Creates a deal. | yes, asks first |
| `update-deal` | Changes a deal's title, value or status. | yes, asks first |
| `delete-deal` | Deletes a deal by id. Cannot be undone from the app. | yes, asks first |
| `list-persons` | Lists persons (contacts), with paging and sorting. | no |
| `get-person` | Returns one person by id, with email, phone and organization. | no |
| `create-person` | Creates a person. | yes, asks first |
| `list-organizations` | Lists organizations, with paging and sorting. | no |
| `get-organization` | Returns one organization by id. | no |
| `create-organization` | Creates an organization. | yes, asks first |
| `update-organization` | Changes an organization's name or owner. | yes, asks first |
| `list-activities` | Lists activities, filtered by type or user. | no |
| `create-activity` | Creates an activity (a call, a meeting, a task). | yes, asks first |
| `list-notes` | Lists notes, filtered by the deal, person or organization they belong to. | no |
| `create-note` | Creates a note on a deal, a person or an organization. | yes, asks first |
| `list-pipelines` | Lists every pipeline. | no |
| `list-stages` | Lists stages, optionally for one pipeline. | no |

## Setup

```bash
agentapps install app.pipedrive pipedrive
agentapps config pipedrive API_TOKEN:<your token>
agentapps pipedrive tools
agentapps pipedrive tool list-deals status:open limit:10
```

`API_TOKEN` is an installation secret: each installation uses its own Pipedrive user's token.
Find it in Pipedrive under Settings > Personal preferences > API. The app can do whatever that
user can do.

## Terms of use

Pipedrive's own terms apply to everything the app does on your behalf:
<https://www.pipedrive.com/en/terms-of-service>. TODO: note here any API rate limit or plan limit
that matters to someone installing the app; none was checked for this README.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | Pipedrive press kit, "Download logo" on <https://www.pipedrive.com/en/newsroom/press-kit> (a Google Drive folder), SVG, `Pipedrive_Monogram_Green background.svg` | none |
| assets/logo-mono.svg | same kit, `Pipedrive_Monogram_Green.svg` | colour replaced by `currentColor` so a host can tint it |
