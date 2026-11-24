# Outlook

Lets an agent work with the signed-in user's Outlook mailbox: list, read and search messages,
send, reply and forward, manage drafts and folders, mark, move and delete messages, and read or
save attachments. It uses the Microsoft Graph mail API (`https://graph.microsoft.com/v1.0`) with
OAuth. It covers mail only: no calendar and no contacts.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-messages` | Lists messages of the inbox or another folder, with an optional filter (10 by default, 100 at most). | no |
| `get-message` | Returns one message with its body and attachments. | no |
| `search-messages` | Searches messages by subject, body or sender. | no |
| `send-message` | Sends an email, optionally with files from the local disk attached. Cannot be unsent. | yes, asks first |
| `reply-message` | Replies to a message. | yes, asks first |
| `forward-message` | Forwards a message to other recipients. | yes, asks first |
| `modify-message` | Marks a message read or unread, sets its importance, categories or flag. | yes, asks first |
| `move-message` | Moves a message to another folder. | yes, asks first |
| `delete-message` | Moves a message to Deleted Items, or deletes it for good with `permanent`. | yes, asks first |
| `list-drafts` | Lists the drafts. | no |
| `create-draft` | Creates a draft. | yes, asks first |
| `update-draft` | Replaces the content of a draft. | yes, asks first |
| `send-draft` | Sends a draft. | yes, asks first |
| `delete-draft` | Deletes a draft. | yes, asks first |
| `list-folders` | Lists the mail folders. | no |
| `create-folder` | Creates a mail folder. | yes, asks first |
| `delete-folder` | Deletes a mail folder and everything in it. | yes, asks first |
| `list-rules` | Lists the inbox rules. | no |
| `get-attachment` | Returns an attachment's content. With `saveToFile` it also writes it to `/workspace/email-attachments`. | yes, asks first |
| `store-attachment` | Saves an attachment to the local disk, in `/workspace/email-attachments` unless a path is given. | yes, asks first |

`send-message`, `get-attachment` and `store-attachment` read and write files on the machine the
app runs on.

## Setup

The app signs in with OAuth, so it first needs an OAuth client of your own. Register an
application in the Microsoft Entra admin center (App registrations), add the redirect URI
`{station URL}/auth/callback` as a Web redirect, create a client secret, and allow the delegated
Microsoft Graph permissions `User.Read`, `offline_access`, `Mail.Read`, `Mail.ReadWrite` and
`Mail.Send`. The app signs in through Microsoft's `common` endpoint.

```bash
agentapps install app.microsoft.outlook outlook
agentapps config app.microsoft.outlook CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
agentapps outlook auth
agentapps outlook tools
agentapps outlook tool list-messages folderId:Inbox maxResults:5
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets, set once on the app id.
`agentapps outlook auth` opens the Microsoft sign-in and stores that account's tokens in the
installation.

## Terms of use

Microsoft's own terms apply to everything the app does on your behalf: the Microsoft APIs Terms
of Use at <https://learn.microsoft.com/en-us/legal/microsoft-apis/terms-of-use> and, for the
account, the Microsoft Services Agreement at <https://www.microsoft.com/en-us/servicesagreement>
or your organization's Microsoft 365 agreement. TODO: note here the sending and Graph throttling
limits that matter to someone installing the app; none was checked for this README.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | <https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/Outlook-Icon-FY26>, Microsoft's site media host; it matches the icon of outlook.office.com. The address was found by the pattern of its sibling icons on the product page | none |
| assets/logo-mono.svg | the same file | made from `assets/logo.svg`: its layers kept apart with `fill-opacity` (0.45 for the lightest to 1 for the darkest), each cut where a later one covers it, and its white shapes cut out (paper.js; the shapes are the file's own) |

The icon on Microsoft's Fluent brand-icon CDN is the previous (2019) design.
