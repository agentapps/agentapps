# @agentapps/testing

## 0.2.5

### Patch Changes

- @agentapps/protocol@0.2.5
- @agentapps/station@0.2.5
- @agentapps/host@0.2.5

## 0.2.4

### Patch Changes

- e92feb6: `create-agent-app dev` reloads when any source file under `src/` changes, and the reload picks up the modules the entry imports; it only watched `app.ts` and kept the rest cached. `poller.start(ctx)` gives a poller its context; before, a poller only ran after a call to an internal method. The conformance suite of `@agentapps/testing` no longer calls the app's first tool for real, and the package declares `vitest` as a peer dependency (DEVX-REQ-1..3).
- Updated dependencies [91c7735]
- Updated dependencies [fe123bc]
  - @agentapps/station@0.2.4
  - @agentapps/protocol@0.2.4
  - @agentapps/host@0.2.4

## 0.2.3

### Patch Changes

- acf5979: Package descriptions use the current vocabulary (Station, not controllers or AppStation).
- Updated dependencies [160b0bf]
- Updated dependencies [acf5979]
- Updated dependencies [2babe5d]
  - @agentapps/station@0.2.3
  - @agentapps/host@0.2.3
  - @agentapps/protocol@0.2.3

## 0.2.2

### Patch Changes

- @agentapps/protocol@0.2.2
- @agentapps/station@0.2.2
- @agentapps/host@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [5ac8330]
  - @agentapps/station@0.2.1
  - @agentapps/host@0.2.1
  - @agentapps/protocol@0.2.1

## 0.2.0

### Patch Changes

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
