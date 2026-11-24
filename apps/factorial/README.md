# Factorial

Lets an agent read HR data from a Factorial company and make a few changes: it lists employees,
teams, time off, attendance shifts, worked time, overtime requests, documents, contract
versions, compensations, legal entities and locations, and it can create a time-off request
and approve or reject an overtime request. It calls the Factorial API (version `2024-10-01`)
at `https://api.factorialhr.com` with the OAuth token of the connected account.

Limits:

- Most of the app is read-only. It does not create or change employees, documents or
  contracts, and it has no payroll tools beyond listing compensations.
- Lists are paged with `limit` and `offset` where the tool has them.
- Calls are not retried, and the app does not refresh an expired access token itself.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-employees` | Lists employees, filtered by active state, team or location. | no |
| `get-employee` | Returns one employee by id. | no |
| `list-teams` | Lists the company's teams. | no |
| `list-team-memberships` | Lists which employees belong to which teams. | no |
| `list-leaves` | Lists time-off requests, filtered by employee, status or dates. | no |
| `get-leave` | Returns one time-off request by id. | no |
| `create-leave` | Creates a time-off request for an employee. | yes, asks first |
| `list-leave-types` | Lists the leave types (vacation, sick leave and so on). | no |
| `list-shifts` | Lists attendance shifts, filtered by employee or dates. | no |
| `list-worked-times` | Lists worked time records, filtered by employee or dates. | no |
| `list-overtime-requests` | Lists overtime requests, filtered by employee or status. | no |
| `approve-overtime` | Approves an overtime request. | yes, asks first |
| `reject-overtime` | Rejects an overtime request. | yes, asks first |
| `list-documents` | Lists documents, filtered by employee or folder. | no |
| `get-document` | Returns one document's details by id. | no |
| `list-contract-versions` | Lists employee contract versions. | no |
| `list-compensations` | Lists employee compensation records. | no |
| `list-legal-entities` | Lists the company's legal entities. | no |
| `list-locations` | Lists the company's work locations. | no |

## Setup

Register an OAuth application in Factorial (its developer documentation is at
<https://apidoc.factorialhr.com/docs>). Copy its client id and client secret and add the
redirect URI the Station uses, `{station URL}/auth/callback`.

```bash
agentapps install app.factorial factorial
agentapps config app.factorial CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
agentapps factorial auth
agentapps factorial tools
agentapps factorial tool list-employees limit:10
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets: one OAuth client for every installation of
the app. `agentapps factorial auth` signs one installation in and stores its tokens. The
sign-in asks for the scopes `employees`, `time_off`, `time_tracking`, `documents`, `contracts`,
`company_locations` and `company_legal_entities`. The tools can see what the connected
Factorial user can see.

## Terms of use

Factorial's own terms apply to everything the app does on your behalf:
<https://factorialhr.com/terms-of-use>. The data is personal data of employees: handle it as
your company's agreement with Factorial and the law require.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | <https://factorial.com/images/factorial-logo-square.svg>, the logo factorial.com declares for itself | none |
| assets/logo-mono.svg | the same file | colour replaced by `currentColor` so a host can tint it |

The [press kit](https://factorial.com/press) has the same mark in PNG only (946x880).
