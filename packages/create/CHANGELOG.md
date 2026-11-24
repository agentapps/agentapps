# @agentapps/create

## 0.3.0

### Minor Changes

- The CLI is a client of one Station. Every command talks to the Station at `cli.stationUrl`; nothing runs an app inside the command any more, so a tool called from the terminal and the same tool called from Claude Code take the same path, under the same Policy. A Station that is not running is said plainly, and the interactive mode offers to start it.

  New commands: `station use <url>`, `station login`, `station logout`, `station apps [add <source|app-id> | remove <app-id>]`, `config <app-id|alias> unset <KEY>`, and `key create <name> <userId> role:<role>`.

  **Breaking.** A workspace config needs `station.id`, `station.publicUrl`, `cli.stationUrl` and `workspace.id`; a config the CLI creates has them. `install` no longer adds an app that is not available: add it first with `station apps add`. `REDIRECT_URI` is no longer a secret of any app: the Station supplies the redirect URI, and `config` shows it with the app's setup instructions (`auth.setup` in the manifest). The `PUBLIC_URL` environment variable is no longer read.

  **Breaking for embedders.** `StationServer` requires `publicUrl`, `stationId`, `workspaceId`, `secretStore` and `dataStore`; `secrets`, `documentStore`, `objectStore`, `volumesBasePath` and `stationSecret` are gone, and so is `SecretsManager`. `@agentapps/station` ships `LocalSecretStore`, `LocalDataStore`, in-memory ones for tests and a contract suite for each.

  API Keys carry a role (`station-operator`, `workspace-owner`, `workspace-member`), and the Station has operations for its own state under `/api`. The Station refreshes OAuth tokens itself, also for calls that come through a Gateway.

### Patch Changes

- c2dfe87: Logos for the catalog, each from the service's own press kit, brand page or site, with the source and every change recorded in the app's README. 93 of 96 apps now have both a colour logo and a one-colour one.

  New or replaced: Amplitude, Asana, Calendly, Canva, Context7, Dropbox, Factorial, Freshdesk, Google Contacts, Granola, Holded, Homey, Hunter, LinkedIn Ads, Mailchimp, Meta Ads, Mixpanel, monday.com, Netlify, Pipedrive, Plaud, PostHog, Playwright, Pushcut, QuickBooks, Salesforce, TikTok Ads and Zapier. Outlook, Word, Excel, OneNote and OneDrive carry Microsoft's current icons instead of the 2019 ones. Corrected: Browserbase, Higgsfield, Kelify, Metricool, Postiz, RentAHuman, Runn and Todo List. Agent Apps' own apps (Filesystem, Hello, Datetime, Compliance Filter, the stdio demo) get a logo in one shared format.

  The create-agent-app skill says how to make the one-colour logo of a badge (cut the white shapes out of the background), when tones of transparency are allowed (a logo made of layers, none below 0.4), to prefer the site's current mark over an outdated press kit, and how to keep a logo a page carries inline.

- Updated dependencies
  - @agentapps/station@0.3.0
  - @agentapps/protocol@0.3.0
  - @agentapps/sdk@0.3.0

## 0.2.5

### Patch Changes

- 5856a6b: `check-app` rejects a tool name that is not kebab-case or that starts with the app's own name (DEVX-REQ-5); the scaffold's rules and the create-agent-app skill say so.
  - @agentapps/protocol@0.2.5
  - @agentapps/sdk@0.2.5
  - @agentapps/station@0.2.5

## 0.2.4

### Patch Changes

- e92feb6: `create-agent-app dev` reloads when any source file under `src/` changes, and the reload picks up the modules the entry imports; it only watched `app.ts` and kept the rest cached. `poller.start(ctx)` gives a poller its context; before, a poller only ran after a call to an internal method. The conformance suite of `@agentapps/testing` no longer calls the app's first tool for real, and the package declares `vitest` as a peer dependency (DEVX-REQ-1..3).
- 58715b5: `sensitive` now means that a tool changes something outside the app's own data (another service, another person, the user's machine). A tool that only changes the app's own Storage, Objects or Volume no longer has to be sensitive, so it runs without asking by default; `check-app` still rejects a read-only tool marked sensitive (DEVX-REQ-4).
- fe123bc: The create-agent-app skill no longer tells authors to publish their app to npm, which does not work yet; it explains the local source. `headerName`, `headerPrefix` (manifest) and `expectedStatuses` (health helper) are marked as having no effect. The help shows the second argument of `serve`.
- Updated dependencies [e92feb6]
- Updated dependencies [91c7735]
- Updated dependencies [fe123bc]
  - @agentapps/sdk@0.2.4
  - @agentapps/station@0.2.4
  - @agentapps/protocol@0.2.4

## 0.2.3

### Patch Changes

- Updated dependencies [160b0bf]
- Updated dependencies [ab95c6b]
- Updated dependencies [acf5979]
- Updated dependencies [2babe5d]
  - @agentapps/station@0.2.3
  - @agentapps/sdk@0.2.3
  - @agentapps/protocol@0.2.3

## 0.2.2

### Patch Changes

- @agentapps/protocol@0.2.2
- @agentapps/sdk@0.2.2
- @agentapps/station@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [5ac8330]
  - @agentapps/station@0.2.1
  - @agentapps/sdk@0.2.1
  - @agentapps/protocol@0.2.1

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
