# SendGrid

Lets an agent send email and manage Marketing Campaigns contacts through the SendGrid v3 API
(`https://api.sendgrid.com/v3`): send a message, add, search and delete contacts, manage contact
lists, read templates, statistics, verified senders and suppressions, and validate an address.
One API key serves every installation of the app.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `send-email` | Sends an email with a text body, an HTML body or both. `from` must be a verified sender. | yes, asks first |
| `list-contacts` | Lists Marketing Campaigns contacts. | no |
| `add-contact` | Adds contacts, or updates the ones whose email already exists. | yes, asks first |
| `get-contact` | Returns one contact by id. | no |
| `delete-contacts` | Deletes one or more contacts by id. | yes, asks first |
| `search-contacts` | Searches contacts with an SGQL query. | no |
| `list-contact-lists` | Lists the contact lists. | no |
| `create-contact-list` | Creates a contact list. | yes, asks first |
| `get-contact-list` | Returns one contact list with its contact count. | no |
| `delete-contact-list` | Deletes a contact list; `deleteContacts` chooses whether its contacts go too. | yes, asks first |
| `list-templates` | Lists dynamic transactional templates. | no |
| `get-template` | Returns one template with its versions. | no |
| `get-stats` | Returns daily global statistics from a start date: requests, delivered, opens, clicks, bounces. | no |
| `list-sender-identities` | Lists the verified sender identities. | no |
| `list-suppressions` | Lists bounces or blocks, optionally in a time range. | no |
| `validate-email` | Validates an email address. It needs Email Validation on the SendGrid plan. | no |

Limits:

- A sent email cannot be taken back.
- `send-email` takes no attachments and no template id.
- Requests are not retried.

## Setup

```bash
agentapps install app.sendgrid sendgrid
agentapps config app.sendgrid API_KEY:<your key>
agentapps sendgrid tools
agentapps sendgrid tool get-stats startDate:2026-01-01
```

`API_KEY` is a system secret: every installation of the app sends from the same SendGrid
account. Create the key in SendGrid under Settings > API Keys.

## Terms of use

SendGrid belongs to Twilio, and Twilio's terms of service apply to everything the app does on
your behalf: <https://www.twilio.com/en-us/legal/tos>.

## Logos

TODO: `assets/logo.svg` and `assets/logo-mono.svg` are named in the manifest and do not exist.
Nobody has looked for SendGrid's official logo yet (Twilio's press kit, brand guidelines or its
own site). Logos are never generated.
