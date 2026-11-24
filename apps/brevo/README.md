# Brevo

Lets an agent work with a Brevo account through the Brevo API (`https://api.brevo.com/v3`): send
transactional emails, manage contacts, lists and templates, create and send email campaigns, and
read delivery statistics. Several tools deliver real email, and they always ask first.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `send-transactional-email` | Sends a transactional email. The sender must be a verified sender or domain of the account. | yes, asks first |
| `list-contacts` | Lists contacts. | no |
| `create-contact` | Creates a contact, or updates an existing one when `updateEnabled` is true. | yes, asks first |
| `get-contact` | Returns one contact by email or id. | no |
| `update-contact` | Updates a contact's attributes, blacklist flags and lists. | yes, asks first |
| `delete-contact` | Deletes a contact and its history for good. | yes, asks first |
| `add-contact-to-list` | Adds contacts to a list, by email or id. | yes, asks first |
| `remove-contact-from-list` | Removes contacts from a list, by email or id. | yes, asks first |
| `import-contacts` | Imports contacts in bulk into lists, from inline data or a file URL. Runs in the background and returns a process id. | yes, asks first |
| `list-attributes` | Lists the contact attributes defined in the account. | no |
| `list-segments` | Lists contact segments. | no |
| `list-folders` | Lists contact folders. | no |
| `list-lists` | Lists contact lists. | no |
| `create-list` | Creates a contact list in a folder. | yes, asks first |
| `list-email-templates` | Lists transactional email templates. | no |
| `create-email-template` | Creates a transactional email template, inactive unless `isActive` is true. | yes, asks first |
| `list-email-campaigns` | Lists email campaigns, filtered by type or status. | no |
| `get-email-campaign` | Returns one email campaign by id. | no |
| `create-email-campaign` | Creates an email campaign: a draft, or a scheduled one when `scheduledAt` is set. | yes, asks first |
| `send-test-email` | Sends a test of a campaign to up to 99 addresses. These are real emails. | yes, asks first |
| `send-email-campaign` | Sends a campaign to all its recipients now. It cannot be undone. | yes, asks first |
| `get-email-event-report` | Returns transactional email events (delivered, opened, clicks, bounces and others). | no |
| `get-aggregated-smtp-report` | Returns transactional email totals for a period. | no |

Limits:

- The app covers email only: no SMS, WhatsApp or CRM deals.
- It cannot delete lists, templates or campaigns.
- Reads are retried twice on a transient error or a rate limit. Writes are never retried, so a
  failed send or import may need to be repeated by hand, after checking it did not go through.

## Setup

```bash
agentapps install app.brevo brevo
agentapps config brevo BREVO_API_KEY:<your API key>
agentapps brevo tools
agentapps brevo tool list-contacts limit:10
```

`BREVO_API_KEY` is an installation secret: each installation has its own. Create it in your Brevo
account, under SMTP & API, API keys.

## Terms of use

Brevo's own terms apply to everything the app does on your behalf, including what you may send
and to whom: <https://www.brevo.com/legal/termsofuse/>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Brevo's press
kit, brand guidelines or its own site). They have been in the repository since before this README
existed and their origin was not written down.
