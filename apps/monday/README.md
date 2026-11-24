# Monday.com

Lets an agent work with monday.com boards: list and read boards, groups, columns and items,
create boards, groups and items, change an item's column values, delete items, and read and add
updates (comments). It calls the monday.com GraphQL API (`https://api.monday.com/v2`) with a
personal API token.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `get-me` | Returns the id, name and email of the token's user. | no |
| `list-boards` | Lists the boards the user can reach, optionally by workspace (25 by default). | no |
| `get-board` | Returns one board with its groups and columns. | no |
| `create-board` | Creates a public, private or shareable board. | yes, asks first |
| `list-items` | Lists a board's items, optionally for one group (50 by default). | no |
| `get-item` | Returns one item with its column values and updates. | no |
| `create-item` | Creates an item on a board, optionally in a group and with column values. | yes, asks first |
| `update-item` | Changes column values of an item. | yes, asks first |
| `delete-item` | Deletes an item. Cannot be undone from the app. | yes, asks first |
| `list-groups` | Lists a board's groups. | no |
| `create-group` | Creates a group on a board. | yes, asks first |
| `list-columns` | Lists a board's columns with their ids and types. | no |
| `add-update` | Adds an update (comment) to an item. | yes, asks first |
| `list-updates` | Lists an item's updates (25 by default). | no |
| `search-items` | Finds items whose name contains a text. | no |

Limits:

- `search-items` is not a full search: it reads the first 100 items of up to 50 boards and
  matches the text against item names.
- Reads are retried on a transient error (429 or 5xx). Writes are never retried, so a failed
  write may need to be repeated by hand.

## Setup

```bash
agentapps install app.monday monday
agentapps config monday MONDAY_API_TOKEN:<your token>
agentapps monday tools
agentapps monday tool list-boards limit:10
```

`MONDAY_API_TOKEN` is an installation secret: each installation uses its own user's token. Copy
your personal API token from your monday.com account: avatar menu > Developers > My access
tokens. The app can do whatever that user can do.

## Terms of use

monday.com's own terms apply to everything the app does on your behalf:
<https://monday.com/l/legal/tos/>. TODO: note here the API limits that matter to someone
installing the app; none was checked for this README.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | <https://dapulse-res.cloudinary.com/image/upload/remote_mondaycom_static/img/monday-logo-2.svg>, the logo monday.com declares for itself | removed the white rectangle behind the mark |
| assets/logo-mono.svg | the same file | removed the white rectangle; colour replaced by `currentColor` so a host can tint it |

The [press kit](https://monday.com/newsroom/press-kit/logos) has only the logo with the name, in PNG.
