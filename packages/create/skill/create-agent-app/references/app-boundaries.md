# App boundaries: new app or extend one?

The default is **one app per product**. Google (Drive, Docs, Sheets, Gmail...) and Microsoft 365
(OneDrive, Excel, Word, OneNote, Outlook) are separate apps even though they share a login.

## Make a separate app when any of these is true

- It is a different product with its own API family (Confluence `/wiki/api/v2` vs Jira
  `/rest/api/3`), even if it shares the account and the token.
- It needs a different credential type (an API token to manage a network vs a device auth key
  to join it).
- It has a different runtime or risk profile (a local daemon or a CLI that touches the user's
  machine vs a plain REST API).
- Users would reasonably want to allow one and not the other. Permissions are per installation,
  so separate apps give "Jira yes, Confluence no" for free.
- Extending would rename things existing installs rely on: the app id, secret names, error
  prefixes, the health check.

The accepted cost of separate apps is entering the same token twice. Say so in each README.

## Keep one app when

- The sub-APIs only make sense together, even on different hosts: geocoding plus forecast, a
  search endpoint plus the read endpoint it points to. Same product, same credential (or none),
  same risk. Use a fixed `baseUrl` per tool in the client.
- The new tools hit the same API, with the same credential, for the same product, and the
  existing app's naming already fits them. Bump the `version` (minor for new tools) in both
  `agentapp.json` and `createApp()`, and update the tool lists in the tests.

## Write the decision down

For anything not obvious, add a short decision note (a spec or design doc in the repo, or a
section in the README) and link it from the change description.

## One credential, several shapes

If a service offers two ways to authenticate (an API token or an OAuth client), prefer **one
secret** that the client recognises by its shape (one prefix used as a bearer token, another
exchanged for a short-lived token and cached). Two optional secrets do not work: every declared
installation secret is required before any tool runs.

## Local CLIs and daemons

- Shelling out to the user's CLI (as a Kubernetes app would with `kubectl`) is fine when the CLI
  already solves auth and the hard commands. Use `execFile` with an argument array, never a
  shell string; validate names before they reach the arguments; use `--flag=value`; allow
  overriding the binary path with a setting.
- Pin where writes can land. Read tools may accept a per-call target (a context, a workspace);
  write tools refuse any target other than the configured one before running anything.
- A local daemon must start lazily on the first tool call (never from health), keep its state
  in memory, redact its credentials from every output, and clean up on session close and on
  process exit, synchronously (the CLI exits right after shutdown).
- If a tool can reach arbitrary targets, require an allowlist setting and make "everything" an
  explicit opt-out (`*`) that logs a warning.
