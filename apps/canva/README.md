# Canva

Lets an agent work with a Canva account through the Canva Connect API
(`https://api.canva.com/rest/v1`): list, create, export, resize and import designs, organise
folders, upload and manage assets, create designs from brand templates, and read and write
comments. The user connects their Canva account with OAuth, and the app acts as that user. It
cannot edit the content of a design.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `get-user` | Returns the authenticated user's id and team id. | no |
| `get-user-profile` | Returns the authenticated user's display name. | no |
| `get-user-capabilities` | Lists what the user's Canva plan and role allow, such as brand templates or autofill. | no |
| `list-designs` | Lists the user's designs, with search, sorting and thumbnails. | no |
| `get-design` | Returns one design: title, owner, thumbnail, edit and view URLs, page count. | no |
| `create-design` | Creates a design from a preset type or a custom size. | yes, asks first |
| `get-design-pages` | Lists the pages of a design with their thumbnails. | no |
| `get-design-export-formats` | Lists the export formats a design supports. | no |
| `export-design` | Starts an export of a design (pdf, png, jpg, gif, pptx, mp4 or an HTML format) and returns a job. | yes, asks first |
| `get-export-job` | Returns an export job's status and, when done, the download URLs. | no |
| `create-resize-job` | Starts a resize of a design to a preset or custom size. The result is a new design. | yes, asks first |
| `get-resize-job` | Returns a resize job's status and result. | no |
| `import-design` | Starts the import of a file at a URL (for example PDF, PPTX or DOCX) as a new design. | yes, asks first |
| `get-import-job` | Returns an import job's status and result. | no |
| `list-folders` | Lists the items in a folder; `root` is the top level. | no |
| `get-folder` | Returns one folder. | no |
| `create-folder` | Creates a folder under a parent folder. | yes, asks first |
| `update-folder` | Renames a folder. | yes, asks first |
| `delete-folder` | Deletes a folder. Its items move to the parent folder. | yes, asks first |
| `move-item` | Moves a design, folder or asset to another folder. | yes, asks first |
| `upload-asset` | Starts the upload of an image, video or audio file from a public URL. | yes, asks first |
| `get-asset-upload-job` | Returns an asset upload job's status and result. | no |
| `get-asset` | Returns one asset's metadata. | no |
| `update-asset` | Changes an asset's name or tags. | yes, asks first |
| `delete-asset` | Deletes an asset (it goes to the trash). | yes, asks first |
| `list-brand-templates` | Lists the brand templates the user can reach. Needs Canva Enterprise. | no |
| `get-brand-template` | Returns one brand template. | no |
| `get-brand-template-dataset` | Returns the fields of a brand template that autofill can set. | no |
| `autofill-design` | Starts the creation of a design from a brand template, filling its fields with the given data. | yes, asks first |
| `get-autofill-job` | Returns an autofill job's status and result. | no |
| `create-thread` | Starts a comment thread on a design (2048 characters at most). | yes, asks first |
| `get-thread` | Returns one comment thread. | no |
| `list-replies` | Lists the replies of a comment thread. | no |
| `create-reply` | Replies to a comment thread (2048 characters at most). | yes, asks first |
| `get-reply` | Returns one reply. | no |

Limits:

- Exports, resizes, imports, asset uploads and autofill run as jobs: the tool that starts one
  returns a job id, and the matching `get-…-job` tool is called until the job is done.
- Reads are retried on a transient error or a rate limit. Writes are never retried.
- The app cannot delete a design.

## Setup

Canva uses OAuth. Create an integration first in the Canva Developer Portal, with the redirect
URI `{station URL}/auth/callback` and the scopes listed under `auth.scopes` in `agentapp.json`.
Canva gives you a client id and a client secret.

```bash
agentapps config app.canva CLIENT_ID:<your client id>
agentapps config app.canva CLIENT_SECRET:<your client secret>
agentapps install app.canva canva
agentapps canva auth
agentapps canva tools
agentapps canva tool list-designs query:poster limit:5
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets: one pair for every installation of the app.
`agentapps canva auth` opens Canva's consent page and stores the user's `ACCESS_TOKEN` and
`REFRESH_TOKEN` as installation secrets; you do not set those by hand. The app refreshes the
access token when it expires.

## Terms of use

Canva's own terms apply to everything the app does on your behalf:
<https://www.canva.com/policies/terms-of-use/>.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | "Canva Icon logo.svg" in <https://www.canva.dev/assets/connect/Canva-logos.zip>, linked from Canva's [brand guidelines for integrations](https://www.canva.dev/docs/apps/rest-apis/brand-guidelines/) | none |
| assets/logo-mono.svg | the same file | the white shape cut out of the background with `fill-rule="evenodd"` instead of painted on it; colours replaced by `currentColor`. The path data is unchanged |

The kit has no one-colour icon. The guidelines say not to alter the logo's colours and to use the icon logo below 50 px.
