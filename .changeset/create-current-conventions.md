---
"@agentapps/create": minor
---

Scaffold apps in the current conventions, add `check-app` and `health`, and ship the create-agent-app skill.

- New default `api` template (REST client with one 30 s deadline, bounded retries for idempotent calls, auth code only for `--auth api-key`). `minimal` and `full` updated; `typescript` is now an alias of `minimal`.
- `agentapp.json` and the `createApp()` config are generated from one object; every tool declares all five annotations; health check, test harness and manifest tests (schema, drift, annotations, logos) are generated.
- Inside the agentapps monorepo the app goes to `apps/<id>` with workspace dependencies and is listed in `agentapps.example.json`; elsewhere a standalone project with registry dependencies is created.
- `check-app` (bins `agentapps-check-app` and the older `agentapps-validate`) runs the manifest schema and the repo rules, and exits non-zero on errors. `health` runs an app's health check once with secrets from environment variables.
- Fixes: the built CLI now lands in `dist/cli.js` where the bins point; `agentapps-validate` and `agentapps-pack` run their command instead of printing help; `dev` loads TypeScript apps through tsx on every Node version.
- Ships the create-agent-app skill (open SKILL.md format, agent-neutral) in `skill/`. Standalone projects get an `AGENTS.md` and the skill in `.agents/skills` and/or `.claude/skills` (`--agent`, `--no-skill`).
- Scaffolded apps include `test/tsconfig.json`; `typecheck` covers the tests.
- `check-app` loads the app and checks the tools it really registers (helpers and shared annotation objects work; annotations only in comments do not), compares `agentapp.json` with `app.toManifest()`, rejects any colour in a mono logo, looks for the logo TODO only in the Logos section, and has `--strict` for TODO text before shipping.
- Standalone projects: formatted at scaffold time (they pass their own lint), git runs after the install and warns when the commit fails, `@agentapps/cli` is a devDependency for live tests, `files` is set, pnpm may build esbuild, `--package-name`, and a `CLAUDE.md` / `.gemini/settings.json` pointer to `AGENTS.md`. A `create` bin makes `pnpm create @agentapps` work. `agentapps-pack` is experimental and no longer generated.
- Every bin has its own entry file, so commands work through pnpm's and Windows' shims (`agentapps-check-app` used to print help and exit 0 under pnpm); with no command and no arguments the CLI exits non-zero. Generated projects run `create-agent-app check-app`.
- check-app fails, with a clear message, when the app calls `process.exit` or does not finish loading (`--load-timeout`), and requires a description and an object parameters schema on every tool.
- `--auth oauth2` (`--provider`, `--scopes`, `--authorize-url`, `--token-url`, `--pkce`) scaffolds an OAuth app whose client refreshes through the host on `401`, with tests for each auth failure; `--system-secrets` adds checked system secrets to an api-key app; `--id` sets a dotted id such as `app.google.ads`. The test harness answers system secrets, token refreshes and secret updates. New apps are inserted into `agentapps.example.json` next to their alphabetical neighbour instead of at the end, check-app no longer warns on hints that set system secrets on the app id, and `health` reads system secrets from the environment.
