# Salesforce

Lets an agent work with a Salesforce org: run SOQL queries, read accounts, contacts,
opportunities, cases, tasks and users, create accounts, contacts, opportunities, leads and
tasks, and update or delete any record. It uses the Salesforce REST API version 59.0 at the
org's own instance URL, with an OAuth token that has the `api` and `refresh_token` scopes.
Sign-in goes through `login.salesforce.com`.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `query` | Runs a SOQL query and returns the records. | no |
| `list-accounts` | Lists accounts (50 by default, 200 at most). | no |
| `get-account` | Returns one account by id. | no |
| `create-account` | Creates an account. | yes, asks first |
| `list-contacts` | Lists contacts (50 by default, 200 at most). | no |
| `get-contact` | Returns one contact by id. | no |
| `create-contact` | Creates a contact. | yes, asks first |
| `list-opportunities` | Lists opportunities (50 by default, 200 at most). | no |
| `create-opportunity` | Creates an opportunity with a stage and a close date. | yes, asks first |
| `create-lead` | Creates a lead. | yes, asks first |
| `list-cases` | Lists cases (50 by default, 200 at most). | no |
| `list-tasks` | Lists tasks (50 by default, 200 at most). | no |
| `create-task` | Creates a task. | yes, asks first |
| `list-users` | Lists users (50 by default, 200 at most). | no |
| `update-record` | Changes fields of a record of any object type. | yes, asks first |
| `delete-record` | Deletes a record of any object type. | yes, asks first |
| `get-record-by-external-id` | Returns a record found by an external id field. | no |
| `describe-object` | Returns an object type's metadata: fields, relationships, record types. | no |

Limits:

- `update-record` and `delete-record` work on every object type the signed-in user can change,
  not only the ones the other tools name.
- Each request has a 30 second deadline. A request that gets a 429 or a 5xx, or that times
  out, is retried up to three times, writes included: a create whose answer was lost may be
  made twice.

## Setup

```bash
agentapps install app.salesforce salesforce
agentapps config app.salesforce CLIENT_ID:<consumer key> CLIENT_SECRET:<consumer secret>
agentapps salesforce auth
agentapps salesforce tools
agentapps salesforce tool list-accounts limit:5
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets: one OAuth client for every
installation of the app. Create a connected app in Salesforce Setup with the `api` and
`refresh_token` scopes, copy its consumer key and secret, and set its callback URL to the
Station's redirect URI, `{station URL}/auth/callback`.

`agentapps salesforce auth` opens Salesforce's sign-in and stores `ACCESS_TOKEN` and
`REFRESH_TOKEN` for the installation. The app also needs `INSTANCE_URL`, the address of the
org. If a tool answers that the instance URL is not configured, set it:

```bash
agentapps config salesforce INSTANCE_URL:https://mycompany.my.salesforce.com
```

## Terms of use

Salesforce's own agreements apply to everything the app does on your behalf. Salesforce lists
them at <https://www.salesforce.com/company/legal/>; the one that covers your org is the
agreement your company signed with Salesforce.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | <https://wp.sfdcdigital.com/en-us/wp-content/uploads/sites/4/2024/11/logo-salesforce.svg>, identical to `Cloud Logo RGB/Salesforce-Corporate-Logo-Cloud-RBG.svg` in the zip behind "Download logos" on <https://brand.salesforce.com/> | removed the XML declaration |
| assets/logo-mono.svg | the same file | its paths joined into one with `fill-rule="evenodd"`, so the white shapes are cut out of the background instead of painted on it; the colours replaced by `currentColor`. The path data is unchanged. Asked for by the project owner. |

Salesforce's [trademark guidelines](https://www.salesforce.com/company/legal/tmcusageguidelines/) say most uses need written permission; nobody has asked.
