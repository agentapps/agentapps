# Dropbox

Lets an agent work with the files of a Dropbox account: list and search folders, read
metadata, create folders, move, copy and delete files, manage shared links, and read the
account and its space usage. It calls the Dropbox API v2 at `https://api.dropboxapi.com/2` with
the OAuth token of the connected account.

Limits:

- The app does not upload or download file content. `get-temporary-link` returns a download
  link that Dropbox expires after 4 hours, and `save-url` asks Dropbox to fetch a URL into a
  file.
- `list-folder` returns 100 entries by default and 2000 at most; `list-folder-continue` reads
  the next page. `search-files` returns 20 results by default and 1000 at most.
- Calls are not retried, and the app does not refresh an expired access token itself.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-folder` | Lists the files and folders in a folder, optionally recursively. | no |
| `list-folder-continue` | Reads the next page of a `list-folder` result from its cursor. | no |
| `get-metadata` | Returns the metadata of a file or folder. | no |
| `search-files` | Searches files and folders by name or content. | no |
| `create-folder` | Creates a folder. | yes, asks first |
| `move-file` | Moves a file or folder to a new path. | yes, asks first |
| `copy-file` | Copies a file or folder to a new path. | yes, asks first |
| `delete-file` | Deletes a file or folder. | yes, asks first |
| `save-url` | Saves the content of a URL to a file in Dropbox. | yes, asks first |
| `get-temporary-link` | Returns a temporary download link for a file. | no |
| `create-shared-link` | Creates a shared link for a file or folder. | yes, asks first |
| `list-shared-links` | Lists the shared links of a path, or all of them. | no |
| `revoke-shared-link` | Revokes a shared link by its URL. | yes, asks first |
| `list-file-requests` | Lists the account's file requests. | no |
| `get-account` | Returns the connected account's profile. | no |
| `get-space-usage` | Returns the space used and the quota. | no |

## Setup

Create an app in the Dropbox App Console (<https://www.dropbox.com/developers/apps>). Copy its
app key and app secret, add the redirect URI the Station uses, `{station URL}/auth/callback`,
and enable the permissions the app asks for: `files.content.read`, `files.content.write`,
`files.metadata.read`, `sharing.read`, `sharing.write` and `account_info.read`.

```bash
agentapps install app.dropbox dropbox
agentapps config app.dropbox CLIENT_ID:<app key> CLIENT_SECRET:<app secret>
agentapps dropbox auth
agentapps dropbox tools
agentapps dropbox tool search-files query:invoice
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets: one OAuth client for every
installation of the app. `agentapps dropbox auth` signs one installation in and stores its
`ACCESS_TOKEN` and `REFRESH_TOKEN`.

## Terms of use

Dropbox's own terms apply to everything the app does on your behalf: the Dropbox Terms of
Service at <https://www.dropbox.com/terms>, and for the app you register, the Developer Terms
and Conditions at <https://www.dropbox.com/developers/reference/tos>.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | Dropbox brand kit, the shared folder linked from <https://brand.dropbox.com/logo>, `Logos/Dropbox/Glyph`, the blue glyph | none |
| assets/logo-mono.svg | the same file (the kit has no black glyph in SVG) | the one colour replaced by `currentColor` so a host can tint it |
