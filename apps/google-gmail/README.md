# Gmail

Lets an agent work with a Gmail mailbox: list, search and read messages, send and reply to email,
manage drafts, labels and filters, and read or save attachments. It calls the Gmail API through
the `googleapis` client with Google OAuth.

Limits: an email that was sent cannot be taken back, so `send-message` and `reply-message` are
marked destructive. `store-attachment`, and `get-attachment` with `saveToFile`, write a new file
on the machine where the app runs. The app has no tool that deletes messages.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-messages` | Lists messages from the inbox or from given labels, with filters such as unread or starred. | no |
| `search-messages` | Searches messages with a Gmail search query. | no |
| `get-message` | Returns the full details of one message. | no |
| `list-drafts` | Lists the drafts in the account. | no |
| `list-labels` | Lists system and custom labels. | no |
| `list-filters` | Lists the account's filters. | no |
| `get-attachment` | Returns the content of an attachment; can save it to a local file. | yes, asks first |
| `store-attachment` | Downloads an attachment and saves it to the local filesystem. | yes, asks first |
| `send-message` | Sends an email. | yes, asks first |
| `reply-message` | Replies to an existing message. | yes, asks first |
| `create-draft` | Creates a draft. | yes, asks first |
| `update-draft` | Replaces the content of a draft. | yes, asks first |
| `delete-draft` | Deletes a draft. | yes, asks first |
| `modify-labels` | Adds or removes labels on a message (read or unread, archive, star). | yes, asks first |
| `create-label` | Creates a label. | yes, asks first |
| `update-label` | Changes a label's name, colours or visibility. | yes, asks first |
| `delete-label` | Deletes a label; the messages that carry it are kept. | yes, asks first |
| `create-filter` | Creates a filter that organises incoming mail. | yes, asks first |
| `delete-filter` | Deletes a filter. | yes, asks first |

Every tool that writes is marked `sensitive`, so hosts ask before running it. `send-message`,
`reply-message`, `update-draft`, `delete-draft`, `delete-label` and `delete-filter` are also
`destructiveHint: true`.

## Setup

The app signs in with Google OAuth 2.0. Whoever runs the Station registers one OAuth client;
each user then connects their own Google account.

1. In the Google Cloud console, create or pick a project, enable the Gmail API and create an
   OAuth client ID of type Web application. Add the redirect URI the Station uses:
   `{station URL}/auth/callback`.
   `agentapps config app.google.gmail`, with no values, prints these steps with the Station's
   redirect URI filled in before it asks for the client.
2. Store the client as system secrets, shared by every installation of the app:

```bash
agentapps config app.google.gmail CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
```

3. Install the app and connect an account:

```bash
agentapps install app.google.gmail gmail
agentapps gmail auth
agentapps gmail tools
agentapps gmail tool search-messages query:"is:unread" maxResults:5
```

The OAuth flow stores the installation secrets `ACCESS_TOKEN`, `REFRESH_TOKEN`, `EMAIL` and
`EXPIRY_DATE`; users never set them by hand.

Scopes requested: `https://www.googleapis.com/auth/gmail.readonly`,
`https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/gmail.modify` and
`https://www.googleapis.com/auth/userinfo.email`.

## Terms of use

Use of the API is governed by the
[Google APIs Terms of Service](https://developers.google.com/terms) and, for the data of the
connected account, the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).
Google's own quotas and sending limits for Gmail apply; this README does not list them.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Google's brand
resources or its own site). They have been in the repository since before this README existed
and their origin was not written down.
