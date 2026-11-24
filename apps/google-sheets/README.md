# Google Sheets

Lets an agent create, read and edit Google Sheets spreadsheets: create a spreadsheet, read a whole
sheet or one range, write, append and clear values, add, copy and delete sheets (tabs), run raw
batch updates for formatting and formulas, and export a sheet to CSV, XLSX, PDF, ODS or TSV. It
calls the Google Sheets API through the `googleapis` client with Google OAuth.

Limits: the app cannot delete a whole spreadsheet; use the Google Drive app for that.
`export-sheet` writes the exported file on the machine where the app runs (`~/Downloads` unless
another path is given).

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `get-spreadsheet` | Returns a spreadsheet's metadata: title, locale, sheets, named ranges and URL. No cell values. | no |
| `list-sheet-tabs` | Lists the sheets (tabs) of a spreadsheet with their metadata. | no |
| `read-spreadsheet` | Reads the data of a spreadsheet. | no |
| `read-sheet-range` | Reads one range in A1 notation. | no |
| `create-spreadsheet` | Creates a spreadsheet with a title and optional initial data. | yes, asks first |
| `write-values` | Writes a 2D array of values to a range, overwriting what is there. | yes, asks first |
| `append-values` | Appends rows after the last row with data. | yes, asks first |
| `batch-update-values` | Writes values to several ranges in one request. | yes, asks first |
| `clear-values` | Clears the values of a range, keeping the formatting. | yes, asks first |
| `add-sheet` | Adds a sheet (tab) to a spreadsheet. | yes, asks first |
| `copy-sheet` | Copies a sheet to another spreadsheet. | yes, asks first |
| `delete-sheet` | Deletes a sheet by its sheet id. | yes, asks first |
| `batch-update` | Runs raw Sheets API batch update requests: formatting, formulas, validation and more. | yes, asks first |
| `export-sheet` | Exports a sheet to CSV, XLSX, PDF, ODS or TSV and saves the file locally. | yes, asks first |

Every tool that writes is marked `sensitive`, so hosts ask before running it. `write-values`,
`batch-update-values`, `clear-values`, `delete-sheet`, `batch-update` and `export-sheet` are also
`destructiveHint: true`.

## Setup

The app signs in with Google OAuth 2.0. Whoever runs the Station registers one OAuth client;
each user then connects their own Google account.

1. In the Google Cloud console, create or pick a project, enable the Google Sheets API and create
   an OAuth client ID of type Web application. Add the redirect URI the Station uses:
   `{station URL}/auth/callback`.
2. Store the client as system secrets, shared by every installation of the app:

```bash
agentapps config app.google.sheets CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
```

3. Install the app and connect an account:

```bash
agentapps install app.google.sheets sheets
agentapps sheets auth
agentapps sheets tools
agentapps sheets tool read-sheet-range fileId:<spreadsheet id> range:"Sheet1!A1:D10"
```

The OAuth flow stores the installation secrets `ACCESS_TOKEN` and `REFRESH_TOKEN`; users never
set them by hand.

Scopes requested: `https://www.googleapis.com/auth/spreadsheets`,
`https://www.googleapis.com/auth/spreadsheets.readonly` and
`https://www.googleapis.com/auth/userinfo.email`.

## Terms of use

Use of the API is governed by the
[Google APIs Terms of Service](https://developers.google.com/terms) and, for the data of the
connected account, the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).
Google's own quotas for the Sheets API apply; this README does not list them.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Google's brand
resources or its own site). They have been in the repository since before this README existed
and their origin was not written down.
