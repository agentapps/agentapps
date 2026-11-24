# Supabase

Lets an agent work with one Supabase project through the project's own HTTP APIs: table rows and
database functions through PostgREST (`/rest/v1`), storage buckets and files through the Storage
API (`/storage/v1`), and the list of authentication users (`/auth/v1/admin/users`). The project
URL and key are shared by every installation. The app does not run arbitrary SQL and does not
upload or download files: it lists files and builds public URLs. What the key may read or change
is decided by the key you configure and by the project's row level security. Requests are not
retried.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `query-table` | Reads rows from a table with PostgREST filters, column selection, ordering and pagination (20 rows by default). | no |
| `get-row` | Returns the one row where a column equals a value. | no |
| `insert-rows` | Inserts one or more rows and returns them. | yes, asks first |
| `update-rows` | Updates the rows that match a filter and returns them. | yes, asks first |
| `delete-rows` | Deletes the rows that match a filter and returns them. A filter is required. | yes, asks first |
| `list-tables` | Lists the tables and views PostgREST exposes. | no |
| `rpc` | Calls a database function with optional named parameters. | yes, asks first |
| `list-buckets` | Lists the project's storage buckets. | no |
| `create-bucket` | Creates a storage bucket, public or private. | yes, asks first |
| `list-files` | Lists the files in a bucket, optionally under a path prefix. | no |
| `get-public-url` | Builds the public URL of a file. It only works for a public bucket. | no |
| `list-users` | Lists the project's authentication users. It needs a `service_role` key. | no |

## Setup

```bash
agentapps install app.supabase supabase
agentapps config app.supabase SUPABASE_URL:https://<project ref>.supabase.co SUPABASE_KEY:<your key>
agentapps supabase tools
agentapps supabase tool query-table table:<table name> limit:5
```

`SUPABASE_URL` and `SUPABASE_KEY` are system secrets: one project for every installation of the
app. Both are in the Supabase dashboard, in the project's API settings: the project URL, and
either the `anon` key or the `service_role` key. The `service_role` key bypasses row level
security, so the agent can then read and change every table.

## Terms of use

Supabase's own terms apply to everything the app does on your behalf:
<https://supabase.com/terms>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Supabase's
press kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
