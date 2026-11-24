# HubSpot

Lets an agent work with a HubSpot CRM account: list, read, create, update and archive contacts,
companies, deals and tickets, search across CRM objects, log engagements (calls, emails,
meetings, notes, tasks), manage associations between objects, read pipelines and lists, and read
and answer inbox conversations. It calls the HubSpot REST API (`https://api.hubapi.com`) with
OAuth.

Limits: the delete tools archive the record (a soft delete) and the app cannot restore it.
Creating an "email" engagement logs a CRM record; it does not send an email.
`send-conversation-message` does reach the customer and cannot be recalled. Tickets, lists and
conversations need optional scopes that the HubSpot account must grant.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `search` | Searches contacts, companies or deals with the CRM search API. | no |
| `list-contacts` | Lists contacts, with pagination. | no |
| `get-contact` | Returns one contact by id or email. | no |
| `list-companies` | Lists companies, with pagination. | no |
| `get-company` | Returns one company by id or domain. | no |
| `list-deals` | Lists deals, with pagination. | no |
| `get-deal` | Returns one deal. | no |
| `list-tickets` | Lists tickets, with pagination. | no |
| `get-ticket` | Returns one ticket. | no |
| `list-engagements` | Lists engagements of one type: call, email, meeting, note or task. | no |
| `get-engagement` | Returns one engagement. | no |
| `list-associations` | Lists the associations of an object with another object type. | no |
| `list-pipelines` | Lists the pipelines for deals or tickets, with their stages. | no |
| `get-pipeline` | Returns one pipeline with its stages. | no |
| `list-lists` | Lists the CRM lists. | no |
| `get-list` | Returns one list. | no |
| `list-conversations` | Lists inbox conversations. | no |
| `get-conversation` | Returns one conversation, with its messages. | no |
| `create-contact` | Creates a contact. | yes, asks first |
| `update-contact` | Updates a contact. | yes, asks first |
| `delete-contact` | Archives a contact. | yes, asks first |
| `create-company` | Creates a company. | yes, asks first |
| `update-company` | Updates a company. | yes, asks first |
| `delete-company` | Archives a company. | yes, asks first |
| `create-deal` | Creates a deal. | yes, asks first |
| `update-deal` | Updates a deal. | yes, asks first |
| `delete-deal` | Archives a deal. | yes, asks first |
| `create-ticket` | Creates a ticket. | yes, asks first |
| `update-ticket` | Updates a ticket. | yes, asks first |
| `delete-ticket` | Archives a ticket. | yes, asks first |
| `create-engagement` | Logs a call, email, meeting, note or task. | yes, asks first |
| `delete-engagement` | Archives an engagement. | yes, asks first |
| `create-association` | Associates two CRM objects. | yes, asks first |
| `delete-association` | Removes an association between two CRM objects. | yes, asks first |
| `send-conversation-message` | Sends a message in an inbox conversation. | yes, asks first |

Every tool that writes is marked `sensitive`, so hosts ask before running it. The delete tools
and `send-conversation-message` are also `destructiveHint: true`.

## Setup

The app signs in with HubSpot OAuth 2.0. Whoever runs the Station registers one OAuth client;
each user then connects their own HubSpot account.

1. In a HubSpot developer account, create an app to get a client id and a client secret. Set its
   redirect URL to the one the Station uses: `{station URL}/auth/callback`. Give it the scopes
   below.
2. Store the client as system secrets, shared by every installation of the app:

```bash
agentapps config app.hubspot CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
```

3. Install the app and connect an account:

```bash
agentapps install app.hubspot hubspot
agentapps hubspot auth
agentapps hubspot tools
agentapps hubspot tool list-contacts limit:10
```

The OAuth flow stores the installation secrets `ACCESS_TOKEN` and `REFRESH_TOKEN`; users never
set them by hand. The app refreshes the access token with the refresh token when it expires.

Scopes requested: `oauth`, `crm.objects.contacts.read`, `crm.objects.contacts.write`,
`crm.objects.companies.read`, `crm.objects.companies.write`, `crm.objects.deals.read`,
`crm.objects.deals.write` and `crm.objects.owners.read`. Optional scopes: `tickets`,
`crm.lists.read`, `crm.lists.write`, `conversations.read` and `conversations.write`.

## Terms of use

HubSpot's terms apply to everything the app does on your behalf: the
[HubSpot Customer Terms of Service](https://legal.hubspot.com/terms-of-service) for the account
and the [HubSpot Developer Terms](https://legal.hubspot.com/hs-developer-terms) for the OAuth app
and its use of the API. HubSpot's own API rate limits apply; this README does not list them.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (HubSpot's
press kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
