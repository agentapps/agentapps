# @agentapps/host

## 0.2.1

### Patch Changes

- @agentapps/protocol@0.2.1

## 0.2.0

### Minor Changes

- be3018a: Add lifecycle hooks: onInstall, onUninstall, onSessionOpen, onSessionClose

  Apps can now initialize state when installed in a new workspace and clean up
  when uninstalled. Session-level hooks fire on session open/close, including
  shutdown.

  New protocol messages:

  - `install` / `installed` (control plane)
  - `uninstall` / `uninstalled` (control plane)
  - `session_opened` / `session_closed` (session plane notifications)

  New SDK API:

  ```ts
  app
    .onInstall(async (ctx) => {
      await ctx.storage.put("settings", "default", { theme: "dark" });
    })
    .onUninstall(async (ctx) => {
      await ctx.log("info", "Cleaning up");
    })
    .onSessionOpen(async (ctx) => {
      ctx.emit("session_started", { userId: ctx.execution.userId });
    })
    .onSessionClose(async (ctx) => {
      await ctx.storage.update("sessions", ctx.execution.userId, {
        endedAt: new Date().toISOString(),
      });
    });
  ```

  New types: `LifecycleContext`, `SessionContext` (extends LifecycleContext with
  execution context and event emission).

  New host methods: `host.install()`, `host.uninstall()`.

### Patch Changes

- Updated dependencies [aa59ce6]
- Updated dependencies [be3018a]
- Updated dependencies [6a5e931]
  - @agentapps/protocol@0.2.0

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
