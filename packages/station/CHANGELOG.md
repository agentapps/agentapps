# @agentapps/controller

## 0.2.3

### Patch Changes

- 160b0bf: Security: after a Station restart, a tool an app marks as destructive or sensitive could run without waiting for approval when it was called before the tools had been listed. The Station now lists an app's tools itself before evaluating a Policy, and refuses the call when it cannot (POLICY-REQ-16).
- acf5979: Package descriptions use the current vocabulary (Station, not controllers or AppStation).
- 2babe5d: Security: the Station started by the CLI listens on this machine only (`127.0.0.1`) instead of on every network interface, and while the workspace has no API key it serves requests without a credential only to this machine. Before, a freshly started Station could be called, and its pending calls approved, by anyone on the same network until the first key was created. `station.host` in `agentapps.json` names another address to listen on (CLI-REQ-12).
  - @agentapps/protocol@0.2.3

## 0.2.2

### Patch Changes

- @agentapps/protocol@0.2.2

## 0.2.1

### Patch Changes

- 5ac8330: An app installed while the Station is running is available to agents without restarting it: its Installations are listed and its tools can be called (DIST-REQ-13).
  - @agentapps/protocol@0.2.1

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

- 3a05ab1: Add HTTP routes for app manifest, launcher HTML, and static bundle serving

  StationServer now exposes four new public GET routes:

  - `GET /apps` — JSON catalog of all registered apps (id, version, name, manifestUrl, bundlesUrl)
  - `GET /apps/:appId/manifest` — full manifest JSON for a specific app
  - `GET /launcher` — generic HTML launcher page listing apps and their launcher screens
  - `GET /apps/:appId/bundles/*` — static file serving from app source directory with path traversal prevention

  AppEntry interface extended with optional `manifest` and `sourcePath` fields.
  CLI `serve` command now passes the full manifest and source path to StationServer.

### Patch Changes

- d21a8d8: A file-backed collection is reloaded from the bytes on disk, not from its mtime: two writes inside one filesystem timestamp tick left the second process reading a stale copy, so the CLI and the Station could miss each other's writes (CLI-REQ-3, CLI-AC-3).
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
