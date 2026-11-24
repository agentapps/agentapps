# Odoo

Lets an agent read and write records in an Odoo database: partners, products, sales orders,
invoices, projects, tasks, employees, time off and timesheets, plus generic tools that work on
any model. It calls the JSON-RPC endpoint of your own Odoo instance (`<BASE_URL>/jsonrpc`) with
an API key.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-partners` | Lists partners (contacts and companies). | no |
| `get-partner` | Returns one partner by id. | no |
| `create-partner` | Creates a partner. | yes, asks first |
| `update-partner` | Changes fields of a partner. | yes, asks first |
| `list-products` | Lists products (`product.template`). | no |
| `list-sale-orders` | Lists sales orders. | no |
| `get-sale-order` | Returns one sales order with its lines. | no |
| `create-sale-order` | Creates a sales order for a partner, optionally with lines. | yes, asks first |
| `list-invoices` | Lists customer invoices (`account.move`). | no |
| `list-projects` | Lists projects. | no |
| `list-tasks` | Lists project tasks. | no |
| `create-project-task` | Creates a task in a project. | yes, asks first |
| `list-employees` | Lists employees (`hr.employee`). | no |
| `list-leaves` | Lists time-off requests (`hr.leave`). | no |
| `create-leave` | Creates a time-off request. | yes, asks first |
| `list-timesheets` | Lists timesheet entries (`account.analytic.line`). | no |
| `create-timesheet` | Creates a timesheet entry. | yes, asks first |
| `list-models` | Lists the models of the database (`ir.model`). | no |
| `search-records` | Searches and reads records of any model. | no |
| `count-records` | Counts the records of any model that match the filters. | no |
| `get-record` | Returns one record of any model by id. | no |
| `create-record` | Creates a record in any model. | yes, asks first |
| `update-record` | Changes fields of a record of any model. | yes, asks first |
| `delete-record` | Deletes a record of any model. Cannot be undone from the app. | yes, asks first |
| `call-method` | Calls any public method of any model. It can do anything the user can do in Odoo. | yes, asks first |

Limits:

- Filters are a comma-separated list such as `is_company=true,name=Acme`, with the operators
  `=`, `!=`, `>`, `>=`, `<` and `<=`. Every filter must match; there is no "or".
- The app sends every model call with user id 1 (see `src/lib/odoo-client.ts`), so the API key
  must be one that Odoo accepts for that user.
- A tool for a model only works when the Odoo app that owns the model is installed (Sales,
  Project, Time Off, Timesheets).
- A request times out after 30 seconds, and no call is retried.

## Setup

```bash
agentapps install app.odoo odoo
agentapps config odoo BASE_URL:https://mycompany.odoo.com DATABASE:<database name> API_KEY:<your key>
agentapps odoo tools
agentapps odoo tool list-partners filters:is_company=true limit:10
```

All three are installation secrets, and all three must be set before any tool runs:

- `BASE_URL`: the address of your Odoo instance, without a path.
- `DATABASE`: the name of the Odoo database.
- `API_KEY`: create it in Odoo, in your user's profile under Account Security > New API Key.

## Terms of use

The app talks to your own Odoo instance, so your agreement with Odoo or with your hosting
provider applies. Odoo's licences and terms are listed at <https://www.odoo.com/legal>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Odoo's press
kit, brand guidelines or its own site). They have been in the repository since before this README
existed and their origin was not written down.
