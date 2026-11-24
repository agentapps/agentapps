# Word

Lets an agent work with Word documents stored in the signed-in user's OneDrive: create a
document, read its text, comments and properties, and make targeted edits that leave the rest of
the file as it was. The app downloads the `.docx` through Microsoft Graph
(`https://graph.microsoft.com/v1.0`, with OAuth), changes its XML and uploads it again. It only
works on `.docx` files, addressed by drive item id (`itemId`) or by path from the drive root
(`path`).

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `get-document-info` | Returns the file's OneDrive metadata, its document properties and its paragraph and word counts. | no |
| `read-document` | Returns the document as markdown, or as HTML. | no |
| `list-paragraphs` | Lists the paragraphs with the indices the edit tools use. | no |
| `get-comments` | Returns the review comments with their authors and dates. | no |
| `create-document` | Creates a document from a list of paragraphs. Fails if the file exists, unless `overwrite` is set. | yes, asks first |
| `append-paragraphs` | Adds paragraphs at the end of the document. | yes, asks first |
| `replace-text` | Replaces text, also where Word split it across formatting runs. | yes, asks first |
| `delete-paragraph` | Deletes one paragraph by its index. | yes, asks first |
| `insert-table` | Appends a table of plain text cells. | yes, asks first |
| `insert-image` | Appends a PNG or JPEG image given as base64. | yes, asks first |
| `insert-page-break` | Appends a page break. | yes, asks first |
| `update-document-properties` | Sets the title, author, subject or description. | yes, asks first |
| `convert-to-pdf` | Converts the document to PDF and saves it in OneDrive. Fails if the file exists, unless `overwrite` is set. | yes, asks first |

Limits:

- Every edit overwrites the stored file. The app cannot undo it: recover an earlier state from
  the file's version history in OneDrive.
- Text inside tables is not listed by `list-paragraphs`, not searched by `replace-text` and
  cannot be deleted by index.
- Paragraph indices change after a delete, so list the paragraphs again before the next one.
- Legacy `.doc` files are refused.

## Setup

The app signs in with OAuth, so it first needs an OAuth client of your own. Register an
application in the Microsoft Entra admin center (App registrations), add the redirect URI
`{station URL}/auth/callback` as a Web redirect, create a client secret, and allow the delegated
Microsoft Graph permissions `User.Read`, `offline_access` and `Files.ReadWrite.All`. The app
signs in through Microsoft's `common` endpoint.

```bash
agentapps install app.microsoft.word word
agentapps config app.microsoft.word CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
agentapps word auth
agentapps word tools
agentapps word tool read-document path:/Documents/report.docx
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets, set once on the app id.
`agentapps word auth` opens the Microsoft sign-in and stores that account's tokens in the
installation. `Files.ReadWrite.All` lets the app read and change every file the account can
reach, not only documents.

## Terms of use

Microsoft's own terms apply to everything the app does on your behalf: the Microsoft APIs Terms
of Use at <https://learn.microsoft.com/en-us/legal/microsoft-apis/terms-of-use> and, for the
account, the Microsoft Services Agreement at <https://www.microsoft.com/en-us/servicesagreement>
or your organization's Microsoft 365 agreement. TODO: note here the Graph throttling limits that
matter to someone installing the app; none was checked for this README.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | <https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/Word-Icon-FY26>, Microsoft's site media host, which serves the icons of its product pages | none |
| assets/logo-mono.svg | the same file | made from `assets/logo.svg`: its layers kept apart with `fill-opacity` (0.45 for the lightest to 1 for the darkest), each cut where a later one covers it, and its white shapes cut out (paper.js; the shapes are the file's own) |

Changed on 2026-11-23, asked for by the project owner: the files this app had were the previous
(2019) design of the Word icon. Nobody has read Microsoft's trademark terms for this use.
