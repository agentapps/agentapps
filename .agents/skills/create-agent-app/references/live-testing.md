# Live test protocol

The live test is where most real bugs are found. It is also where you can damage someone's data
or leak a secret, so it follows a fixed order: plan, health, isolate, read-only first, prove the
sandbox, writes only in the sandbox, clean up, verify, report.

## 1. Plan before the first call

Write down (in your notes or the change description):

- Which account or workspace you will use, and why it is a sandbox (a test site, a free-tier
  account, a local cluster, a throwaway key). No sandbox means a read-only live test.
- Which tools you will call, read-only first.
- Which writes were approved. Writes nobody approved are not called; list them as "not tested
  live".
- What you will create and how you will remove it (the app's own delete tool, the service's UI,
  or a cleanup script that refuses any target outside the sandbox).

Credentials come from the user, through an environment variable or a file they prepared. Never
create accounts or keys yourself, never type a secret into a command line that gets logged,
never echo one, never paste one into a report. To check one, print only its name, prefix and
length.

## 2. Health first

```bash
SERVICE_API_KEY="$SERVICE_API_KEY" create-agent-app health <app-dir>
```

It runs the app's health check once against the real service, reading installation secrets from
environment variables with the manifest's names, and prints the status, issues, duration and
which secret *names* were set. It must answer `ready` in well under 10 s. Also try it with a
secret unset (`not_ready`, `MISSING_SECRET`) and, if you can, with a wrong one. System secrets
come from environment variables too. For an OAuth app, pass a current `ACCESS_TOKEN` (from the
OAuth flow below or the provider's token playground): the health command has no station, so it
cannot refresh one.

## 3. Install under an alias in an isolated workspace

Use the `agentapps` CLI:

- In a project made with `npm create @agentapps`, it is already there as the `@agentapps/cli`
  devDependency: run it as `npx @agentapps/cli`.
- In any other project: `npm i -D @agentapps/cli` (or `npm i -g @agentapps/cli`).
- In the agentapps monorepo: the one built from your checkout, see `monorepo.md`.
- **Never install the unscoped `agentapps` package from npm.** It is an unrelated project with
  the same name. If `npx @agentapps/cli --help` does not list `install`, `config` and `permissions`,
  you are running the wrong program: stop and check.

Give it a scratch config that lists only your app, so nothing else is touched:

```bash
SCRATCH=<a scratch directory>; mkdir -p "$SCRATCH"
PORT=<a free port, not the one of the user's own station>
printf '{ "station": { "port": %s, "publicUrl": "http://localhost:%s" }, "cli": { "stationUrl": "http://localhost:%s" }, "apps": [ { "source": "%s" } ] }\n' \
  "$PORT" "$PORT" "$PORT" "$(cd <app-dir> && pwd)" > "$SCRATCH/agentapps.json"
cp ~/.agentapps/config.json "$SCRATCH/global-config.backup.json" 2>/dev/null || true
aa() { npx @agentapps/cli --config "$SCRATCH/agentapps.json" "$@"; }   # a function works in bash and zsh
```

The CLI can rewrite `~/.agentapps/config.json` (its `workspace` entry) when it runs from a new
place; restore the backup when you finish. Instances and installation secrets live in
`$SCRATCH/.agentapps/`.

```bash
aa apps                                   # your app is listed
aa install app.<id> <alias>
aa <alias> tools                          # the tool list you designed
aa permissions <alias>                    # sensitive tools = ask, the rest = allow
aa <alias> tool <read-tool>               # apps with auth, no secrets yet: exit 2 + config hint
aa config <alias> SERVICE_API_KEY:"$SERVICE_API_KEY"   # installation secret, on the ALIAS
aa status <alias>
```

- **Installation secrets go on the alias** (`config <alias> KEY:value`): they belong to that
  installation. `config app.<id> KEY:value` writes *system* secrets, which the app does not read
  as installation secrets.
- There is no secret delete: `config <alias> "KEY:"` clears one.
- A `sensitive` tool without `-y` must exit 2 with "needs approval (marked sensitive)". Re-run
  with `-y` only for writes you planned.
- System secrets (an OAuth client, a developer app id) are the exception: they are shared by
  every installation, so they go on the app id, `config app.<id> KEY:value`.
- Tool arguments: `key:value` pairs (number-like values become numbers, even when quoted), a
  single inline JSON object (`'{"zip":"08001"}'`, keeps strings), or `-` to read a JSON object
  from stdin. The `--json` flag formats the *output*.

### OAuth apps

The station runs the OAuth flow: it builds the authorize URL, receives the callback, exchanges
the code and stores the tokens for the installation. So:

1. The user registers an OAuth client with the provider, or gives you its id and secret, with
   the station's callback as redirect URI: `<station.publicUrl>/auth/callback`
   (`http://localhost:<port>/auth/callback` for a local station). The redirect URI is never a
   secret of the app: the station supplies it. A provider in a testing mode (Google's "Testing"
   publishing status) accepts only listed test users: add the account first.
2. The scratch `agentapps.json` above already carries both `station.publicUrl` (a station does
   not start without a public URL) and `cli.stationUrl` (where the CLI finds the station). Start
   the station in another terminal with `aa serve`, and set the client on the app id:
   `aa config app.<id> CLIENT_ID:"$CLIENT_ID" CLIENT_SECRET:"$CLIENT_SECRET"`. Run
   `aa config app.<id>` with no values to read the app's `auth.setup` steps with the redirect
   URI filled in.
3. `aa <alias> auth` opens the consent page and waits until the station has the tokens;
   `--url-only` prints the URL for a browser elsewhere. `aa <alias> auth reauth` discards the
   tokens and starts again, `aa <alias> auth logout` removes them. `aa status <alias>` says
   whether the installation is authenticated. Never print the stored tokens.
4. Test the failure paths you can: no tokens yet (`[AUTH_REQUIRED]` and the `auth` hint), and a
   revoked permission (remove the app's access in the account's security settings, then call a tool):
   the reconnect message, not a raw 401.

## 4. Read-only pass

Call every read tool at least once with realistic arguments, including:

- the largest realistic result (a big list, a long document, a long date range): under 50,000
  characters, with `limitApplied` / `hasMore` or a clear error?
- an id that does not exist: a clear not-found message?
- number-like ids typed the CLI way;
- the second page, using the returned cursor.

Save one real response per endpoint (synthetic values only) for the mocks if you have not yet.

Before any write, make one read that proves the alias points at the sandbox (get the sandbox
space or project by its key and check the id).

## 5. Write pass (sandbox only, approved writes only)

- Create, read back, update, delete what you created. Name things so they explain themselves:
  `agentapps-live-test-<date>`.
- Check the annotations against reality: call an `idempotentHint: true` tool twice; check a
  write returns a short summary.
- If a write tool takes a target override (context, workspace), check it refuses the override
  before doing anything, and that nothing changed.

## 6. Clean up and verify

- Remove everything you created, then **prove** it is gone (a GET returns 404, a search
  returns 0, the resource list is empty).
- Revoke throwaway keys (for OAuth: `aa <alias> auth logout`, and remove the app's access in the
  account settings if the user asks). Clear the alias's secrets (`aa config <alias> "KEY:"`) and
  `aa uninstall <alias>`, or delete `$SCRATCH`.
- Restore `~/.agentapps/config.json` from the backup.
- Search your logs and notes for secret prefixes (`Bearer`, `sk-`, `ghp_`, service-specific
  ones) before sharing them.

## 7. Report

In the change description's "Tested" line and in your notes: which kind of account (never the
secret), which tools ran live, what was created and removed, what was not tested live and why,
and each bug found (each one now has a mocked regression test).

## Optional: through an MCP client

`aa serve <port>` starts the station (the port is positional; log in `.agentapps/station.log`).
Tools appear to MCP clients as `<alias>_<tool>`. Approval of `sensitive` tools is enforced by
the station, not by the MCP client, and some clients auto-deny or auto-allow MCP tools in
non-interactive modes: check how yours behaves before relying on it.
