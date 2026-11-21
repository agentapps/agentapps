# @agentapps/create

## 0.2.0

### Minor Changes

- 67f582c: Scaffold apps in the current conventions, add `check-app` and `health`, and ship the create-agent-app skill.

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

### Patch Changes

- Updated dependencies [d21a8d8]
- Updated dependencies [aa59ce6]
- Updated dependencies [be3018a]
- Updated dependencies [6a5e931]
- Updated dependencies [3a05ab1]
  - @agentapps/station@0.2.0
  - @agentapps/protocol@0.2.0
  - @agentapps/sdk@0.2.0

## 1.0.0

### Major Changes

- 3c2fc32: First stable release of the Agent Apps open SDK, protocol, and toolchain.

  **Protocol** — complete v2.0 message schemas (zod), control plane, session plane, transport interface, error model, grants, conversation hooks, intents, permissions, UI surfaces, storage, telemetry.

  **SDK** — app authoring with `createApp()`, tools, health checks, callbacks, annotations, OAuth2 auth, conversation hooks, intents, permissions, UI surfaces, storage client. Declarative tool annotations (no inference heuristics).

  **Controller** — instance lifecycle (spawn on-demand, idle teardown, watchdog), traffic proxy with backpressure, runtime adapters (in-process, local process, Docker, HTTP Docker), secrets management, runtime sharding, telemetry.

  **Host** — platform-side API for consuming agent apps via controllers, conversation hooks, installation lifecycle, intents, permissions, storage, token refresh.

  **Execution Host** — standalone deployable that manages local app instances and exposes /v1/\* API for remote controllers.

  **CLI** — REPL and one-shot mode, `auth` with full OAuth flow (`--url-only` and `--exchange-code` for headless/mobile auth), `config` for system secrets (partial updates, REDIRECT_URI infra key), `instances` with color-coded auth status (50x faster via static manifest reads), global workspace config (`~/.agentapps`), shell completions.

  **Testing** — test harness and conformance suite for app developers.

  **Create** — scaffolding CLI (`npm create @agentapps`), templates, dev mode, validation, packaging.

### Patch Changes

- Updated dependencies [3c2fc32]
  - @agentapps/protocol@1.0.0
  - @agentapps/sdk@1.0.0
  - @agentapps/controller@1.0.0
