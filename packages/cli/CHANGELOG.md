# @agentapps/cli

## 0.2.4

### Patch Changes

- 1960b41: Every tool of every app declares its five annotations, decided by reading what the tool does. 469 tools that ran without asking now wait for approval by default, because they change something in another service or on your machine, among them Stripe refunds, GitHub merges, sending email from Gmail and Outlook, and Zapier actions; none stopped asking. Tools that change nothing, or only the app's own data, run as before. Every app has a new patch version.

  Security: the Gmail and Outlook apps saved an attachment under the name its sender chose, so a name with `../` could place the file outside the download folder. The name is now reduced to a bare file name.

- 91c7735: The CLI and the Station it starts keep a workspace's Volume and Objects in the same directory, `.agentapps/data` in the workspace (or `AGENTAPPS_VOLUMES_BASE_PATH`). The Station used `~/.agentapps/data`, so a file one of them wrote was not there for the other; files a Station wrote there before this version stay in that directory. Links to private Objects are signed with a secret kept in the workspace, so they stay valid across a Station restart and a link created from the CLI is served by the Station (CLI-REQ-14).
- 7fe597e: `app.google.calendar` 1.0.2: every tool declares its five annotations, so `delete_event` waits for approval by default; it ran without asking. `app.hello` 1.0.2: full annotations and a README.
- fe123bc: The create-agent-app skill no longer tells authors to publish their app to npm, which does not work yet; it explains the local source. `headerName`, `headerPrefix` (manifest) and `expectedStatuses` (health helper) are marked as having no effect. The help shows the second argument of `serve`.
- Updated dependencies [91c7735]
- Updated dependencies [fe123bc]
  - @agentapps/station@0.2.4
  - @agentapps/protocol@0.2.4
  - @agentapps/host@0.2.4

## 0.2.3

### Patch Changes

- bb153cf: The npm package of each app now says what it is: description, license, author, keywords, a link to its source and a README. Every app in the catalog gets a new patch version with it (DIST-REQ-14).
- d77f84f: `agentapps info <appId>` for an app that is not downloaded yet shows its real auth type, system secrets, author and license. It reported `Auth: none` and `System secrets: none` for every app (DIST-REQ-2).
- ab95c6b: Messages say Installation and Installation secret where they said instance and user secret, and the help lists `installations` instead of a command that does not exist.
- c8dea59: Security: the files where the CLI keeps system and Installation secrets are now readable by their owner only (mode 0600). They were written with the default permissions before (CLI-REQ-13).
- 2babe5d: Security: the Station started by the CLI listens on this machine only (`127.0.0.1`) instead of on every network interface, and while the workspace has no API key it serves requests without a credential only to this machine. Before, a freshly started Station could be called, and its pending calls approved, by anyone on the same network until the first key was created. `station.host` in `agentapps.json` names another address to listen on (CLI-REQ-12).
- Updated dependencies [160b0bf]
- Updated dependencies [acf5979]
- Updated dependencies [2babe5d]
  - @agentapps/station@0.2.3
  - @agentapps/host@0.2.3
  - @agentapps/protocol@0.2.3

## 0.2.2

### Patch Changes

- 86219ba: `agentapps completions install` sets up Tab completion: it writes the script to `~/.agentapps` and adds one guarded line to the shell's rc file that sources it, so a new terminal does not start Node and nothing breaks if the CLI is removed. `completions uninstall` takes it away. An older `eval "$(agentapps completions …)"` line is replaced (CLI-REQ-10).
- c517f2c: The `aa` command is removed. macOS ships its own `aa` (Apple Archive), and installing the CLI put a second one on the PATH. Use `agentapps`.
- 684ed1a: `agentapps version` prints the version and `agentapps help` prints the help (it printed nothing before). An unknown option or command now says what to run instead: `agentapps help`, or `agentapps` alone for the interactive mode (CLI-REQ-11).
  - @agentapps/protocol@0.2.2
  - @agentapps/station@0.2.2
  - @agentapps/host@0.2.2

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
