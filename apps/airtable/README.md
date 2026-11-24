# Airtable

Lets an agent work with Airtable bases through the Airtable web API
(`https://api.airtable.com/v0`): list bases and tables, read, create, update and delete records,
read and add record comments, and create a webhook on a base. It can do only what the personal
access token of the installation allows.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-bases` | Lists the bases the token can reach. | no |
| `list-tables` | Lists the tables of a base, with their fields. | no |
| `list-records` | Lists records of a table, with an optional formula filter, field selection and sorting. Returns 100 records at most unless `maxRecords` says otherwise. | no |
| `get-record` | Returns one record by id. | no |
| `create-records` | Creates one or more records in a table. | yes, asks first |
| `update-records` | Updates one or more records, each named by its id. | yes, asks first |
| `delete-records` | Deletes records by id, up to 10 in one call. | yes, asks first |
| `list-comments` | Lists the comments on a record. | no |
| `add-comment` | Adds a comment to a record. | yes, asks first |
| `create-webhook` | Creates a webhook on a base and returns its id and MAC secret. | yes, asks first |

Limits:

- The app cannot create or change bases, tables or fields, and cannot list or delete webhooks.
- Requests are not retried.

## Setup

```bash
agentapps install app.airtable airtable
agentapps config airtable API_TOKEN:<your personal access token>
agentapps airtable tools
agentapps airtable tool list-tables baseId:appXXXXXXXXXXXXXX
```

`API_TOKEN` is an installation secret: each installation has its own. It is an Airtable personal
access token (it starts with `pat`), created in Airtable's Builder Hub under Personal access
tokens. Give it the scopes and the bases you want the agent to reach.

## Terms of use

Airtable's own terms apply to everything the app does on your behalf:
<https://www.airtable.com/company/tos>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Airtable's
press kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
