# Excel

Lets an agent work with Excel workbooks stored in the signed-in user's OneDrive: read and write
ranges and formulas, manage worksheets and tables, format and sort cells, and add charts and
render them as images. It uses the Microsoft Graph workbook API
(`https://graph.microsoft.com/v1.0`) with OAuth. It only works on `.xlsx` files, addressed by
drive item id (`itemId`) or by path from the drive root (`path`).

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `get-workbook` | Returns a workbook's file metadata and its worksheets, and confirms it is a usable `.xlsx`. | no |
| `create-workbook` | Creates an empty workbook in OneDrive. Fails if the file exists, unless `overwrite` is set. | yes, asks first |
| `list-worksheets` | Lists the worksheets with their position and visibility. | no |
| `add-worksheet` | Adds a worksheet. | yes, asks first |
| `rename-worksheet` | Renames a worksheet, or changes its position or visibility. | yes, asks first |
| `delete-worksheet` | Deletes a worksheet and everything on it. | yes, asks first |
| `read-range` | Reads a range: values, display text and formulas. | no |
| `read-used-range` | Reads every populated cell of a worksheet. | no |
| `write-range` | Writes values, or formulas with `formulas:true`, into a range. | yes, asks first |
| `clear-range` | Clears a range's contents, formatting or both. | yes, asks first |
| `format-range` | Sets number format, font, fill colour and alignment of a range. | yes, asks first |
| `sort-range` | Sorts a range by one or more columns. | yes, asks first |
| `insert-rows-or-columns` | Inserts blank rows or columns, shifting the existing cells. | yes, asks first |
| `delete-rows-or-columns` | Deletes rows or columns, shifting the remaining cells. | yes, asks first |
| `list-tables` | Lists every table in the workbook. | no |
| `add-table` | Turns a range into a table. | yes, asks first |
| `add-table-rows` | Appends rows to a table. | yes, asks first |
| `add-chart` | Adds a chart to a worksheet from a range of data. | yes, asks first |
| `get-chart-image` | Renders a chart as a base64 PNG. A render above 5 MB is refused. | no |
| `calculate-workbook` | Makes Excel recalculate the workbook. | yes, asks first |

Limits:

- The app cannot undo a write. Recover an earlier state from the file's version history in
  OneDrive.
- There are no workbook sessions and no batching: each call stands alone, so one write over a
  wide range is better than many small ones.

## Setup

The app signs in with OAuth, so it first needs an OAuth client of your own. Register an
application in the Microsoft Entra admin center (App registrations), add the redirect URI
`{station URL}/auth/callback` as a Web redirect, create a client secret, and allow the delegated
Microsoft Graph permissions `User.Read`, `offline_access` and `Files.ReadWrite.All`. The app
signs in through Microsoft's `common` endpoint.

```bash
agentapps install app.microsoft.excel excel
agentapps config app.microsoft.excel CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
agentapps excel auth
agentapps excel tools
agentapps excel tool list-worksheets path:/Documents/budget.xlsx
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets, set once on the app id.
`agentapps excel auth` opens the Microsoft sign-in and stores that account's tokens in the
installation. `Files.ReadWrite.All` lets the app read and change every file the account can
reach, not only workbooks.

## Terms of use

Microsoft's own terms apply to everything the app does on your behalf: the Microsoft APIs Terms
of Use at <https://learn.microsoft.com/en-us/legal/microsoft-apis/terms-of-use> and, for the
account, the Microsoft Services Agreement at <https://www.microsoft.com/en-us/servicesagreement>
or your organization's Microsoft 365 agreement. TODO: note here the Graph throttling limits that
matter to someone installing the app; none was checked for this README.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | <https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/Excel-Icon-FY26>, Microsoft's site media host, which serves the icons of its product pages | none |
| assets/logo-mono.svg | the same file | made from `assets/logo.svg`: its layers kept apart with `fill-opacity` (0.45 for the lightest to 1 for the darkest), each cut where a later one covers it, and its white shapes cut out (paper.js; the shapes are the file's own) |

Changed on 2026-11-23, asked for by the project owner: the files this app had were the previous
(2019) design of the Excel icon. Nobody has read Microsoft's trademark terms for this use.
