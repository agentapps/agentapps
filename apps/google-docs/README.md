# Google Docs

Lets an agent create, read and edit Google Docs documents: insert and append text, delete a
range, find and replace, insert tables and images, style text and read named ranges. It calls
the Google Docs API v1 through the `googleapis` client, with the OAuth token of the connected
Google account.

Limits:

- The app does not list, search or delete documents: it needs a document's id, and deleting a
  document is done with the Google Drive app.
- Positions are Docs indexes (index 1 is the start of the document). Use `read-document` to
  find them before `insert-text`, `delete-content` or `update-text-style`.
- `insert-image` needs an image URL that anyone can open.
- `update-document` and `replace-all-text` do the same thing: replace every occurrence of a
  text.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `create-document` | Creates a document with a title and optional first content; returns its id and URL. | yes, asks first |
| `read-document` | Reads a document's content. | no |
| `insert-text` | Inserts text at an index. | yes, asks first |
| `append-text` | Appends text at the end of a document. | yes, asks first |
| `delete-content` | Deletes the content between two indexes. | yes, asks first |
| `replace-all-text` | Replaces every occurrence of a text and returns how many changed. | yes, asks first |
| `update-document` | Replaces every occurrence of a text, for placeholders and the like. | yes, asks first |
| `insert-table` | Inserts a table of given rows and columns at an index. | yes, asks first |
| `insert-image` | Inserts an inline image from a URL at an index. | yes, asks first |
| `update-text-style` | Sets bold, italic, underline, strikethrough, font and colour on a range. | yes, asks first |
| `batch-update-document` | Runs several insert, delete and replace operations as one request. | yes, asks first |
| `get-named-ranges` | Lists a document's named ranges, optionally by name. | no |

## Setup

In a Google Cloud project, enable the **Google Docs API**. Create an OAuth client of type *Web
application* (<https://console.cloud.google.com/apis/credentials>) with the redirect URI the
Station uses, `{station URL}/auth/callback`, and add these scopes to the consent screen:
`https://www.googleapis.com/auth/documents`,
`https://www.googleapis.com/auth/documents.readonly` and
`https://www.googleapis.com/auth/userinfo.email`.

```bash
agentapps install app.google.docs docs
agentapps config app.google.docs CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
agentapps docs auth
agentapps docs tools
agentapps docs tool read-document documentId:<document id>
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets: one OAuth client for every installation of
the app. `agentapps docs auth` signs one installation in and stores its `ACCESS_TOKEN` and
`REFRESH_TOKEN`. The document id is the long part of a document's URL, between `/d/` and
`/edit`.

## Terms of use

Google's own terms apply to everything the app does on your behalf: the Google APIs Terms of
Service at <https://developers.google.com/terms> and the Google API Services User Data Policy
at <https://developers.google.com/terms/api-services-user-data-policy>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Google's
brand resources or its own site). They have been in the repository since before this README
existed and their origin was not written down.
