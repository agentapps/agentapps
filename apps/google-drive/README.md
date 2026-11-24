# Google Drive

Lets an agent work with the files of a Google account in Google Drive: list and search files and
folders, read file metadata and the text of a Google Doc or text file, create folders and Google
Docs, upload, download, copy, move, share and delete files, and read and write comments and
replies. It calls the Google Drive API through the `googleapis` client with Google OAuth.

Limits: `get-file-content` returns plain text for Google Docs and text files only; it does not
extract text from binary files such as PDF or Word. `download-file` and `upload-file` read and
write files on the machine where the app runs (downloads go to `~/Downloads` unless another path
is given).

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-files` | Lists files and folders, with filters by folder, file type and search query. | no |
| `search-files` | Searches files by name, optionally by MIME type. | no |
| `get-file` | Returns the details of one file or folder. | no |
| `get-file-content` | Returns the plain-text content of a Google Doc or text file. | no |
| `list-comments` | Lists the comments on a file. | no |
| `get-comment` | Returns one comment by id. | no |
| `list-replies` | Lists the replies to a comment. | no |
| `create-folder` | Creates a folder. | yes, asks first |
| `create-document` | Creates a native Google Doc from HTML, Markdown or plain text. | yes, asks first |
| `upload-file` | Uploads a local file, optionally converting it to a native Google file. | yes, asks first |
| `download-file` | Downloads a file to the local filesystem; overwrites a file with the same path. | yes, asks first |
| `copy-file` | Creates a copy of a file. | yes, asks first |
| `move-file` | Moves a file or folder to another folder. | yes, asks first |
| `share-file` | Shares a file or folder with an email address. | yes, asks first |
| `delete-file` | Deletes a file or folder. | yes, asks first |
| `create-comment` | Adds a comment to a file. | yes, asks first |
| `create-reply` | Replies to a comment; can also resolve it. | yes, asks first |
| `update-comment` | Changes the content of a comment. | yes, asks first |
| `delete-comment` | Deletes a comment. | yes, asks first |

Every tool that writes is marked `sensitive`, so hosts ask before running it. `delete-file`,
`delete-comment`, `share-file` and `download-file` are also `destructiveHint: true`.

## Setup

The app signs in with Google OAuth 2.0. Whoever runs the Station registers one OAuth client;
each user then connects their own Google account.

1. In the Google Cloud console, create or pick a project, enable the Google Drive API and create
   an OAuth client ID of type Web application. Add the redirect URI the Station uses:
   `{station URL}/auth/callback`.
2. Store the client as system secrets, shared by every installation of the app:

```bash
agentapps config app.google.drive CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
```

3. Install the app and connect an account:

```bash
agentapps install app.google.drive drive
agentapps drive auth
agentapps drive tools
agentapps drive tool search-files searchTerm:report maxResults:5
```

The OAuth flow stores the installation secrets `ACCESS_TOKEN` and `REFRESH_TOKEN`; users never
set them by hand.

Scopes requested: `https://www.googleapis.com/auth/drive`,
`https://www.googleapis.com/auth/drive.file` and
`https://www.googleapis.com/auth/userinfo.email`.

## Terms of use

Use of the API is governed by the
[Google APIs Terms of Service](https://developers.google.com/terms) and, for the data of the
connected account, the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).
Google's own quotas for the Drive API apply; this README does not list them.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Google's brand
resources or its own site). They have been in the repository since before this README existed
and their origin was not written down.
