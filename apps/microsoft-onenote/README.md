# OneNote

Lets an agent work with the signed-in user's OneNote notebooks: browse notebooks, section groups,
sections and pages, read a page as markdown, search pages, create notebooks, sections and pages,
and append to, replace, copy or delete a page. It uses the Microsoft Graph OneNote API
(`https://graph.microsoft.com/v1.0`) with OAuth. Page content is written as markdown and
converted to the HTML OneNote stores.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-notebooks` | Lists every notebook the account can open, shared ones included. | no |
| `get-notebook` | Returns one notebook by id. | no |
| `create-notebook` | Creates a notebook. | yes, asks first |
| `list-section-groups` | Lists section groups, optionally for one notebook. | no |
| `list-sections` | Lists sections. With `notebookId`, only that notebook's top-level sections. | no |
| `create-section` | Creates a section in a notebook. | yes, asks first |
| `list-pages` | Lists pages, newest first, for one section or for every notebook (100 at most). | no |
| `get-page` | Returns a page's title, dates, position and parent section. | no |
| `get-page-content` | Returns a page's body as markdown, or as HTML with element ids when `includeIDs` is set. | no |
| `search-pages` | Searches pages by text. | no |
| `create-page` | Creates a page in a section. | yes, asks first |
| `append-to-page` | Adds content to a page, at the end or next to one element. | yes, asks first |
| `replace-page-content` | Replaces a page's content or its title. Cannot be undone. | yes, asks first |
| `copy-page-to-section` | Copies a page to another section and waits for the copy to finish. | yes, asks first |
| `delete-page` | Deletes a page. The app cannot restore it. | yes, asks first |

Limits:

- `search-pages` may miss pages: where full-text search is not available for the account it
  only matches page titles.
- Notebook and section names are 50 characters at most and may not contain
  `? * \ / : < > | ' " #`.
- `copy-page-to-section` waits up to 60 seconds for OneNote to finish.
- There are no tools to delete or rename a notebook or a section.

## Setup

The app signs in with OAuth, so it first needs an OAuth client of your own. Register an
application in the Microsoft Entra admin center (App registrations), add the redirect URI
`{station URL}/auth/callback` as a Web redirect, create a client secret, and allow the delegated
Microsoft Graph permissions `User.Read`, `offline_access`, `Notes.ReadWrite.All` and
`Notes.Create`. The app signs in through Microsoft's `common` endpoint.

```bash
agentapps install app.microsoft.onenote onenote
agentapps config app.microsoft.onenote CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
agentapps onenote auth
agentapps onenote tools
agentapps onenote tool list-pages sectionId:<section id>
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets, set once on the app id.
`agentapps onenote auth` opens the Microsoft sign-in and stores that account's tokens in the
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
| assets/logo.svg | <https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/OneNote-Icon-FY26>, Microsoft's site media host, which serves the icons of its product pages | none |
| assets/logo-mono.svg | the same file | made from `assets/logo.svg`: its layers kept apart with `fill-opacity` (0.45 for the lightest to 1 for the darkest), each cut where a later one covers it, and its white shapes cut out (paper.js; the shapes are the file's own) |

Changed on 2026-11-23, asked for by the project owner: the files this app had were the previous
(2019) design of the OneNote icon. Nobody has read Microsoft's trademark terms for this use.
