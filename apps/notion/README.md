# Notion

Lets an agent work in a Notion workspace through the Notion API (`https://api.notion.com/v1`,
API version `2026-03-11`, with the official `@notionhq/client` SDK): search pages and databases,
read and write pages, query and edit databases and their rows, read and edit blocks, read users,
manage comments and upload files. It signs in with OAuth and sees only the pages and databases
the user shared with the integration when connecting.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `search` | Searches pages and databases by title, with an optional `page` or `data_source` filter. | no |
| `get-page` | Returns a page: title, icon, cover, parent and properties. | no |
| `get-page-markdown` | Returns a page's whole content as markdown, optionally with meeting-note transcripts. | no |
| `create-page` | Creates a page under a page, or a row under a database. | yes, asks first |
| `update-page` | Updates a page's properties, or moves it to the trash or restores it (`archived`). | yes, asks first |
| `update-page-markdown` | Edits a page's content as markdown: replaces the whole body (the default), appends, or applies text edits. | yes, asks first |
| `set-page-icon` | Sets a page's icon to an emoji or an image URL. | yes, asks first |
| `set-page-cover` | Sets a page's cover to an image URL. | yes, asks first |
| `duplicate-page` | Copies a page with its icon, cover, properties and blocks, under the same parent or another one. | yes, asks first |
| `get-database` | Returns a database: title, data sources and column schema. | no |
| `query-database` | Lists a database's rows with a Notion filter and sorts. | no |
| `create-database` | Creates a database under a page, with its initial columns. | yes, asks first |
| `update-database-schema` | Adds, changes or removes columns, and can rename the database. Removing a column deletes its values. | yes, asks first |
| `create-database-item` | Adds a row from a flat map of column name to value (`{ Status: "Done" }`). | yes, asks first |
| `update-database-item` | Updates a row from a flat map of column name to value, or moves it to the trash or restores it. | yes, asks first |
| `get-block` | Returns one block. | no |
| `get-blocks` | Lists the direct children of a page or block, with their ids. | no |
| `get-block-children` | Deprecated. Returns the whole block tree under a page or block as markdown-like text. | no |
| `append-blocks` | Appends Notion block objects to a page or block, at the end, at the start or after a block. | yes, asks first |
| `update-block` | Replaces a piece of text inside one text block. | yes, asks first |
| `delete-block` | Moves a block to Notion's trash. No tool of this app restores it. | yes, asks first |
| `create-column-layout` | Appends a column layout to a page, one column per list of blocks. | yes, asks first |
| `create-advanced-blocks` | Appends one callout, toggle, synced block, meeting notes or paragraph block to a page. | yes, asks first |
| `list-users` | Lists the users of the workspace. | no |
| `get-user` | Returns one user. | no |
| `get-me` | Returns the bot user the integration acts as. | no |
| `list-comments` | Lists the comments on a page or block. | no |
| `create-comment` | Posts a comment on a page, or a reply in a discussion. | yes, asks first |
| `update-comment` | Changes a comment's text. | yes, asks first |
| `delete-comment` | Deletes a comment. It cannot be recovered. | yes, asks first |
| `upload-file` | Uploads a file (a data URL, or a path on the machine that runs the app) and returns a file upload id to use in a block or a `files` column. | yes, asks first |

Limits:

- Lists return 100 items per call at most (`limit`), with a cursor for the next page.
- `upload-file` takes files up to 20 MB, sent in one part.
- A database with several data sources is read and written through its first one unless the
  call names a `dataSourceId`.
- There is no tool that deletes a page. `update-page` and `update-database-item` with
  `archived: true` move it to Notion's trash, and `archived: false` restores it.
- Reads are retried up to three times on a rate limit or a server error. Creating, appending
  and deleting are never retried, so a failed call may need to be repeated by hand.
- `get-block-children` follows nested blocks ten levels deep.

## Setup

The app uses OAuth, so it needs an OAuth client first. In Notion, open
<https://www.notion.so/profile/integrations>, create a public integration and add
`{station URL}/auth/callback` as its redirect URI. Notion then shows the integration's OAuth
client id and client secret. They are system secrets: one client for every installation of the
app.

```bash
agentapps install app.notion notion
agentapps config app.notion CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
agentapps notion auth
agentapps notion tools
agentapps notion tool search query:roadmap limit:5
```

`agentapps notion auth` opens Notion's consent page, where the user picks the pages and
databases to share, and stores that account's tokens (`ACCESS_TOKEN`, `REFRESH_TOKEN`,
`EXPIRY_DATE`) in the installation. Nobody sets those by hand. A page or database that was not
shared answers "not found"; share it with the integration from the page's Connections menu in
Notion.

When Notion rejects the access token, the app asks Notion for a new one with the refresh token
and the client secret, stores it and repeats the request once. If that fails, connect again
with `agentapps notion auth`.

## Terms of use

Notion's own terms apply to everything the app does on your behalf:
<https://www.notion.com/terms>. Notion limits how fast an integration may call its API; the
limits are described at <https://developers.notion.com/reference/request-limits>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Notion's
press kit, brand guidelines or its own site). They have been in the repository since before
this README existed and their origin was not written down.
