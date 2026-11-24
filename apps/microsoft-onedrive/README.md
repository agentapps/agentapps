# OneDrive

Lets an agent manage the files in the signed-in user's OneDrive: browse, search, read, upload,
download, copy, move, rename and delete files and folders, convert documents to PDF, and share
them by link or by invitation. It uses the Microsoft Graph API
(`https://graph.microsoft.com/v1.0`) with OAuth, always on the user's own drive (`/me/drive`).
Items are addressed by drive item id (`itemId`) or by path from the drive root (`path`).

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `get-drive-info` | Returns the account's drive, with storage quota and usage. | no |
| `list-items` | Lists the files and folders in a folder, the drive root by default (50 by default, 200 at most). | no |
| `get-item` | Returns the metadata of one file or folder. | no |
| `search-items` | Searches the drive for files and folders matching a text. | no |
| `list-recent` | Lists the files the account used recently. | no |
| `list-shared-with-me` | Lists items other people shared with the account. Listing only: the other tools cannot open them. | no |
| `list-versions` | Lists a file's version history. | no |
| `get-file-content` | Returns the content of a text file inline, up to 1 MB. | no |
| `download-file` | Saves a file to the local disk, in `/workspace/onedrive-downloads` unless a path is given. | yes, asks first |
| `convert-file` | Converts a document to PDF and saves it to the local disk. | yes, asks first |
| `upload-file` | Uploads a local file, replacing a file of the same name. | yes, asks first |
| `create-folder` | Creates a folder. | yes, asks first |
| `copy-item` | Copies a file or folder to another folder and waits for the copy to finish. | yes, asks first |
| `move-item` | Moves a file or folder to another folder. | yes, asks first |
| `rename-item` | Renames a file or folder. | yes, asks first |
| `delete-item` | Moves a file or folder to the recycle bin. The app cannot restore it. | yes, asks first |
| `list-permissions` | Lists who has access to an item and through which links. | no |
| `create-share-link` | Creates a sharing link with a chosen permission and audience. | yes, asks first |
| `invite-people` | Shares an item with people by email, with read or write access. | yes, asks first |
| `remove-permission` | Revokes a sharing permission or link. | yes, asks first |

Limits:

- `download-file` and `convert-file` refuse files above 50 MB.
- `upload-file` sends files of 4 MB or more in chunks; a failed chunk aborts the whole upload.
- `upload-file`, `download-file` and `convert-file` read and write files on the machine the app
  runs on.

## Setup

The app signs in with OAuth, so it first needs an OAuth client of your own. Register an
application in the Microsoft Entra admin center (App registrations), add the redirect URI
`{station URL}/auth/callback` as a Web redirect, create a client secret, and allow the delegated
Microsoft Graph permissions `User.Read`, `offline_access`, `Files.ReadWrite.All` and
`Sites.Read.All`. The app signs in through Microsoft's `common` endpoint.

```bash
agentapps install app.microsoft.onedrive onedrive
agentapps config app.microsoft.onedrive CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
agentapps onedrive auth
agentapps onedrive tools
agentapps onedrive tool list-items path:/Documents maxResults:10
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets, set once on the app id.
`agentapps onedrive auth` opens the Microsoft sign-in and stores that account's tokens in the
installation.

## Terms of use

Microsoft's own terms apply to everything the app does on your behalf: the Microsoft APIs Terms
of Use at <https://learn.microsoft.com/en-us/legal/microsoft-apis/terms-of-use> and, for the
account, the Microsoft Services Agreement at <https://www.microsoft.com/en-us/servicesagreement>
or your organization's Microsoft 365 agreement. TODO: note here the Graph throttling limits that
matter to someone installing the app; none was checked for this README.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | <https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/OneDrive-Icon-FY26>, Microsoft's site media host, which serves the icons of its product pages | none |
| assets/logo-mono.svg | the same file | made from `assets/logo.svg`: its layers kept apart with `fill-opacity` (0.45 for the lightest to 1 for the darkest), each cut where a later one covers it, and its white shapes cut out (paper.js; the shapes are the file's own) |

Changed on 2026-11-23, asked for by the project owner: the files this app had were the previous
(2019) design of the OneDrive icon. Nobody has read Microsoft's trademark terms for this use.
