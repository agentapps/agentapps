# @agentapps/create

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
