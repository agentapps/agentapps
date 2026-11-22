# @agentapps/cli

## 0.2.1

### Patch Changes

- 8ea0056: The Station starts when no app has been downloaded yet, instead of failing on a fresh install, and no longer logs every catalog app as not found. `tsx` is no longer a dependency of the CLI: installing it brings fewer packages and no install-script warning. Loading an app from TypeScript source uses the `tsx` next to the CLI or in the app's project, and says how to install it when it is missing (DIST-REQ-11, DIST-REQ-12).
- 5ac8330: An app installed while the Station is running is available to agents without restarting it: its Installations are listed and its tools can be called (DIST-REQ-13).
- Updated dependencies [5ac8330]
  - @agentapps/station@0.2.1
  - @agentapps/host@0.2.1
  - @agentapps/protocol@0.2.1

## 0.2.0

### Patch Changes

- 6a5e931: Require the fixed versions of two libraries with known vulnerabilities: `@modelcontextprotocol/sdk` 1.32.2 or later in the CLI and `zod` 4.6.6 or later in the protocol.
- 3a05ab1: Add HTTP routes for app manifest, launcher HTML, and static bundle serving

  StationServer now exposes four new public GET routes:

  - `GET /apps` — JSON catalog of all registered apps (id, version, name, manifestUrl, bundlesUrl)
  - `GET /apps/:appId/manifest` — full manifest JSON for a specific app
  - `GET /launcher` — generic HTML launcher page listing apps and their launcher screens
  - `GET /apps/:appId/bundles/*` — static file serving from app source directory with path traversal prevention

  AppEntry interface extended with optional `manifest` and `sourcePath` fields.
  CLI `serve` command now passes the full manifest and source path to StationServer.

- b67a536: zsh completions no longer print `command not found: compdef` in shells that never ran compinit (stock macOS zsh): the script loads compinit first when needed.
- Updated dependencies [d21a8d8]
- Updated dependencies [aa59ce6]
- Updated dependencies [be3018a]
- Updated dependencies [6a5e931]
- Updated dependencies [3a05ab1]
  - @agentapps/station@0.2.0
  - @agentapps/protocol@0.2.0
  - @agentapps/host@0.2.0

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
  - @agentapps/controller@1.0.0
  - @agentapps/host@1.0.0
