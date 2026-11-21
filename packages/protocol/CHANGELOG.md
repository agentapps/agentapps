# @agentapps/protocol

## 0.2.0

### Minor Changes

- aa59ce6: Enhance launcher with condition evaluation and auto-open

  The `GET /launcher` page now:

  - Embeds manifest data as JSON in a `<script type="application/json">` tag
  - Evaluates screen `condition` predicates client-side (e.g. `'authenticated'`, `'!authenticated'`)
  - Auto-opens the first eligible launcher screen in a sandboxed iframe
  - Provides an "Authenticated" toggle to test condition-based visibility
  - Uses a sidebar + content layout with app cards on the left and iframe on the right
  - Adds `data-condition` and `data-bundle-url` attributes to screen buttons for JS interactivity
  - Handles screens without `bundleUrl` gracefully (listed but not openable in iframe)

  Protocol `ScreenDeclarationSchema` gains `launcher` and `condition` fields
  with full Zod validation and type guards (`isLauncherScreen`).

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

- 6a5e931: Require the fixed versions of two libraries with known vulnerabilities: `@modelcontextprotocol/sdk` 1.32.2 or later in the CLI and `zod` 4.6.6 or later in the protocol.

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
