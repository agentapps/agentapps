# Changelog

All notable changes to the Agent Apps monorepo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.5] — 2026-11-22

Tool names follow one rule across the catalog. **This renames tools in 31 apps**: update any Policy rule or prompt that names one.

### Changed

- **Tool names are kebab-case, verb first, without the app's name.** An agent sees `linear__list-issues` where it saw `linear__linear-list-issues`, and `delete-event` where it saw `delete_event`. 400 tools are renamed:
  - the app's name is gone from the tools of Linear, Render, Railway, Runn, Homey, Higgsfield and Google Analytics (`linear-list-issues` → `list-issues`, `analytics-run-report` → `run-report`);
  - underscores became hyphens in 22 apps: Airtable, Amplitude, Cloudflare, Datadog, ElevenLabs, Filesystem, Google Calendar, Holded, Jira, Mixpanel, PostHog, Pushcut, QuickBooks, Replicate, Sentry, Shopify, Stripe, Supabase, Telegram, Twilio, Vercel and the stdio demo;
  - six names now start with a verb: Higgsfield's `generate-image`, `animate-image`, `generate-video` and `generate-soul-image`, ElevenLabs' `generate-speech` and Runn's `get-project-totals`.
- Each of those apps has a new major version. A Policy rule keeps the name it was written with: a rule on `linear-delete-issue` no longer matches anything, so write it again as `delete-issue`. `agentapps policy show <name>` lists your rules.
- `check-app` rejects a tool name that breaks the rule, and the scaffold and the create-agent-app skill state it.

### Removed

- Slack's `health-check` tool, a probe left from an earlier platform that agents could see. The app's health check now does what it did: it asks Slack whether the token still works.

---

## [0.2.4] — 2026-11-22

Every tool in the catalog now says how dangerous it is, and the default Policy acts on it. Update with `npm install -g @agentapps/cli`, then `agentapps station restart`.

### Security

- **Every tool declares its annotations.** Of the 1 410 tools of the published apps, 160 declared all five; the rest left a write looking harmless. Each one is now annotated from what it does. 469 tools that ran without asking now wait for approval by default, because they change something in another service or on your machine, among them Stripe refunds, GitHub merges, sending email from Gmail and Outlook, and Zapier actions. No tool stopped asking. `delete_event` of Google Calendar was the one delete that ran unasked.
- **Attachment names cannot leave their folder.** The Gmail and Outlook apps saved an attachment under the name its sender chose, so a name with `../` could place the file elsewhere on the machine. The name is reduced to a bare file name.

### Changed

- **Three kinds of tool.** A tool that changes nothing runs. A tool that changes only the app's own data (its Storage, Objects or Volume) runs. A tool that changes something outside, or cannot be undone, is marked `sensitive` or `destructiveHint` and waits for approval. `sensitive` used to mean "not read-only", so every write asked; `check-app`, the scaffold and the create-agent-app skill follow the new rule.
- **One data directory.** The CLI and the Station it starts keep a workspace's Volume and Objects in `.agentapps/data` in the workspace (or `AGENTAPPS_VOLUMES_BASE_PATH`). The Station used `~/.agentapps/data`, so neither saw the other's files; files a Station wrote there stay in that directory.
- Every app that changed has a new patch version: 83 apps.

### Fixed

- Links to private Objects stay valid across a Station restart, and a link created from the CLI is served by the Station. Each process signed them with its own random secret; the secret now lives in the workspace.
- `create-agent-app dev` reloads when any source file under `src/` changes, and the reload picks up the modules the entry imports. It only watched `app.ts`.
- `poller.start(ctx)` gives a poller its context. A poller only ran after a call to an internal method.
- The conformance suite of `@agentapps/testing` no longer runs the app's first tool for real, the package declares `vitest` as a peer dependency, and its README describes the API it has.
- The create-agent-app skill no longer tells authors to publish their app to npm, which does not work yet; it explains the local source.
- `app.hello` passes `check-app`: full annotations and a README.

---

## [0.2.3] — 2026-11-22

A security release. Update with `npm install -g @agentapps/cli`, then `agentapps station restart`.

### Security

- **The Station listens on this machine only.** A Station started by the CLI listened on every network interface and, until the workspace had its first API key, answered requests that carried no credential as the admin: anyone on the same network could call the installed apps and approve waiting calls. It now listens on `127.0.0.1`, and without a key it answers only this machine. To serve another address on purpose, set `station.host` in `agentapps.json`.
- **A destructive tool always waits for approval.** After a Station restart, a tool an app marks as destructive or sensitive could run without asking when it was called before the tools had been listed. The Station now learns an app's tools before it evaluates a Policy, and refuses the call when it cannot.
- **Secret files are readable by their owner only.** The files that hold system secrets and Installation secrets are written with mode `0600`.

### Changed

- **Each app's npm package says what it is**: description, license, author, keywords, a link to its source and a README. Every app in the catalog has a new patch version with it; `posthog` and `whatsapp` are 2.1.0.
- Messages say Installation and Installation secret where they said instance and user secret.

### Fixed

- `agentapps info <appId>` for an app that is not downloaded yet shows its real auth type, system secrets, author and license. It reported `Auth: none` for every app.
- The help lists `installations`; it named a command that does not exist.
- The README and the architecture page said apps run as child processes; the Station the CLI starts runs them in its own process.

---

## [0.2.2] — 2026-11-22

### Added

- **`agentapps completions install`** sets up Tab completion for bash or zsh: it writes the script under `~/.agentapps` and adds one guarded line to the shell's rc file. A new terminal does not start Node, and nothing breaks if the CLI is removed later. `agentapps completions uninstall` takes it away.
- **`agentapps version`** prints the version, like `--version` and `-V`.

### Changed

- **The `aa` command is gone.** macOS ships its own `aa` (Apple Archive), and installing the CLI put a second one on the PATH. Use `agentapps`.
- An unknown option or command now says what to run instead: `agentapps help`, or `agentapps` alone for the interactive mode.

### Fixed

- `agentapps help` prints the help. It printed nothing before.

---

## [0.2.1] — 2026-11-22

Three fixes for the first minutes after `npm install -g @agentapps/cli`.

### Fixed

- **The Station starts on a fresh install.** `agentapps station start` failed when no app had been downloaded yet, and logged every catalog app as not found. It now starts with whatever is there.
- **Apps installed while the Station is running reach your agents.** Before, an app installed after `station start` was invisible to agents until the Station was restarted.
- **A lighter install, without the install-script warning.** `tsx` is no longer a dependency of the CLI, so npm does not bring `esbuild` or warn about its install script. It is only needed to load an app from TypeScript source, and the CLI says how to install it when it is missing.

---

## [0.2.0] — 2026-11-22

The first version meant to be installed from npm: `npm install -g @agentapps/cli`.

### Added

- **Install without the repository.** The CLI works from any directory with a home workspace, carries a catalog of 90 apps, and downloads an app when it is installed. An app that is not in the catalog is found by its name: `agentapps install app.github github-work` fetches `@agentapps/app.github` from npm.
- **App packages.** Every app is published as `@agentapps/<appId>`, a self-contained package with no dependencies to resolve.
- **`agentapps connect <name>`** connects any agent platform that speaks MCP: it creates an API key with that name and prints the MCP server entry to add. `connect claude-code` registers it for you. The gateway is `agentapps mcp <name>`.
- **`npx @agentapps/cli`** runs the CLI by its package name.
- **Policies by key name.** API key names are unique among active keys, and `agentapps policy` accepts the name: `agentapps policy set cursor app.github merge-pull ask`.
- **Gateways see only what their Policy allows.** A gateway lists the Installations its key may use.
- A single executable per platform and a `curl | sh` installer, built by the release (not served yet).

### Fixed

- The MCP gateway waits for an Approval instead of timing out, and reopens its session after the Station restarts.
- A call waiting for an Approval keeps its session, and a caller that goes away cancels its Approval.
- The CLI and the Station no longer miss each other's writes to the same storage file.
- `--config` no longer changes the saved workspace.

### Security

- `@modelcontextprotocol/sdk` 1.32.2 and `zod` 4.6.6 or later are required; both had known vulnerabilities in the versions used before.

### Not included

- The apps `playwright`, `browserbase`, `discord` and `filesystem` need native dependencies and are not published yet.

---

## [1.0.0] — 2026-07-28

First stable release of the Agent Apps open SDK, protocol, and toolchain.

### Added

#### CLI (`@agentapps/cli`)
- [x] `--url-only` flag: generate OAuth URL without starting a callback server (for headless/mobile auth via Pushcut)
- [x] `--exchange-code <code>` flag: exchange an authorization code for tokens (completing the headless flow)
- [x] `config` command: partial updates (set one secret at a time without repeating all)
- [x] `config` command: REDIRECT_URI accepted as infrastructure key for all OAuth apps
- [x] HTTP Basic Auth for OAuth token exchange (Notion compatibility, RFC 6749 §2.3.1)
- [x] Color-coded auth status in `instances` (green/orange/red)
- [x] 50x performance improvement for `instances` command (static manifest reads, no tsx imports)
- [x] Global workspace config (`~/.agentapps/config.json`) — CLI works from any directory
- [x] `--set-workspace` flag for explicit workspace configuration
- [x] Shell completions (bash/zsh)

### Changed
- [x] Tool annotations are declarative only — removed `inferToolAnnotations` heuristic from SDK
- [x] All 8 packages published as `1.0.0` on npm under `@agentapps/*` scope

---

## [0.1.0] — 2026-07-26

Initial pre-alpha release of the Agent Apps open SDK, controller, and protocol.

### Added

#### Protocol (`@agentapps/protocol`)
- [x] Complete v2.0 message schemas (zod): control plane + session plane
- [x] Tool definitions, error codes, and transport interface
- [x] Grants schema with `requires` declarations and `permission_denied` errors
- [x] Conversation hooks protocol: `annotate` and `veto` message types
- [x] Installation lifecycle hooks: `onInstall`, `onUninstall`, `onUpgrade`
- [x] Intents & bindings: `intent_call` / `intent_result` message types
- [x] Inbound event subscriptions: `subscribeInbound()` / `sendInboundEvent`
- [x] User permissions protocol with enforcement
- [x] UI surfaces: renderers, interfaces, screens, component vocabulary
- [x] Platform storage, Volumes, and Files protocol
- [x] Telemetry provider messages
- [x] `onRefreshToken` handler and `refresh_token` callback messages

#### SDK (`@agentapps/sdk`)
- [x] App authoring layer: `createApp()`, tool registration, health checks, callbacks
- [x] Full OAuth2 auth modelling (PKCE, scopeSeparator, api-key, github-app)
- [x] `auth.refresh()` for delegating token refresh to the host
- [x] Event, polling, and webhook helpers
- [x] Docker/container runtime helpers and SDK↔controller contract
- [x] `HealthCheckBuilder` and API error classification utilities
- [x] `hasSubscribers()` and `activeSubscriptions()` on `ToolContext`
- [x] Autonomous HTTP runtime with protocol v2.0 endpoints
- [x] Conversation hooks SDK: annotate & veto
- [x] Intents SDK: `ctx.intent()`, `BindingStore`
- [x] `ctx.permissions` for runtime permission checks
- [x] UI surfaces SDK: renderers, interfaces, screens
- [x] Platform storage client, Volumes, and Files

#### Controller (`@agentapps/controller`)
- [x] Instance lifecycle: spawn on-demand, idle teardown, watchdog
- [x] Traffic proxy with backpressure
- [x] Runtime adapters: in-process, `LocalProcessRuntime`, `DockerRuntime`, `HttpDockerRuntime`
- [x] `DockerRuntime` with graceful shutdown + crash detection
- [x] Docker volume mounts
- [x] `SecretsManager` for DockerRuntime with local callback interception
- [x] `HttpDockerRuntime` secrets-manager support
- [x] Runtime sharding (Phase 7)
- [x] Telemetry provider integration
- [x] Docker runtime extension

#### Host (`@agentapps/host`)
- [x] Platform-side API: `AgentAppHost` + `Session`
- [x] Platform actions & user profile
- [x] Conversation hooks host-side: annotate & veto dispatch
- [x] Installation lifecycle dispatch
- [x] Intents & bindings host-side: `BindingStore`, `intent_call` / `intent_result`
- [x] Inbound event subscriptions host-side
- [x] User permissions enforcement
- [x] Platform storage host-side
- [x] `onRefreshToken` handler

#### Execution Host (`@agentapps/execution-host`)
- [x] Runtime sharding support (Phase 7)

#### CLI (`@agentapps/cli`)
- [x] REPL-style interactive CLI with instances, auth, and human renderer
- [x] One-shot mode with preserved shell quoting
- [x] `config` command for app-level system secrets
- [x] `auth` command with full OAuth flow end-to-end
- [x] `--manual-code` flag for copy-paste OAuth flow
- [x] `bind`, `unbind`, `list-bindings` commands + binding state
- [x] User permissions CLI commands
- [x] Grants consent screen at install time
- [x] `tsx` loader for multi-file TypeScript app sources
- [x] `alias <tool>` shorthand for tool invocation
- [x] Human renderer improvements for arrays and long values
- [x] `FileServer` for public file HTTP URLs
- [x] Storage/Volumes/Files under `.agentapps/store/`

#### Testing (`@agentapps/testing`)
- [x] Test harness for app developers
- [x] Conformance suite with Gherkin scenarios for conversation hooks

#### Create (`@agentapps/create`)
- [x] Scaffolding CLI (`npm create @agentapps`): templates, dev mode, validation, packaging

#### Infrastructure
- [x] WebSocket transport
- [x] GitHub Actions publish workflow
- [x] TypeDoc API documentation setup
- [x] Biome linting configuration

### Fixed
- [x] OAuth state mismatch: reject `waitForCallback` immediately on mismatch
- [x] SDK: propagate `pkce` and `scopeSeparator` in OAuth2 auth callback
- [x] CLI: readline handling during interactive config prompts (close, pause, resume)
- [x] CLI: auth URL shown when browser open fails (macOS fix)
- [x] CLI: table renderer padding and separator alignment
- [x] CLI: success summary placement below rendered data

### Changed
- [x] npm scope renamed from `@agent-apps` to `@agentapps`
- [x] Dropped `containerMode: 'shared'` in favour of per-installation instances
- [x] Storage/Volumes/Files moved from `.secrets/` to `.agentapps/store/`
- [x] App IDs derived from manifest instead of `agentapps.json` keys
- [x] System secrets no longer loaded from env in `agentapps.json` (deprecated)

---

## Future — MCA migrations to Agent Apps

### Third-party integrations

- [ ] `mca.activecampaign` — ActiveCampaign
- [ ] `mca.brevo` — Brevo
- [ ] `mca.browserbase` — Browserbase
- [ ] `mca.canva` — Canva
- [ ] `mca.clickup` — ClickUp
- [ ] `mca.context7` — Context7
- [ ] `mca.discord` — Discord
- [x] `mca.elevenlabs` — ElevenLabs
- [ ] `mca.excalidraw` — Excalidraw
- [ ] `mca.factorial` — Factorial
- [ ] `mca.figma` — Figma
- [x] `mca.github` — GitHub
- [ ] `mca.google.analytics` — Google Analytics
- [x] `mca.google.calendar` — Google Calendar
- [ ] `mca.google.contacts` — Google Contacts
- [ ] `mca.google.docs` — Google Docs
- [ ] `mca.google.drive` — Google Drive
- [ ] `mca.google.forms` — Google Forms
- [ ] `mca.google.gmail` — Gmail
- [ ] `mca.google.sheets` — Google Sheets
- [ ] `mca.google.slides` — Google Slides
- [ ] `mca.higgsfield` — Higgsfield
- [ ] `mca.homey` — Homey
- [ ] `mca.hubspot` — HubSpot
- [ ] `mca.hunter` — Hunter
- [ ] `mca.intercom` — Intercom
- [ ] `mca.kelify` — Kelify AI Property Search
- [ ] `mca.linear` — Linear
- [ ] `mca.make` — Make
- [ ] `mca.microsoft.outlook` — Outlook
- [ ] `mca.minio` — MinIO
- [ ] `mca.monday` — Monday.com
- [ ] `mca.netlify` — Netlify
- [x] `mca.notion` — Notion
- [ ] `mca.odoo` — Odoo
- [ ] `mca.plaud` — PLAUD
- [ ] `mca.railway` — Railway
- [ ] `mca.render` — Render
- [ ] `mca.rentahuman` — RentAHuman.ai
- [x] `mca.replicate` — Replicate
- [ ] `mca.runn` — Runn
- [x] `mca.sentry` — Sentry Error Monitoring
- [ ] `mca.slack` — Slack
- [ ] `mca.todoist` — Todoist
- [ ] `mca.trello` — Trello
- [ ] `mca.whatsapp` — WhatsApp
- [ ] `mca.zendesk` — Zendesk

### First-party (Agent Apps)

- [ ] `mca.admin` — Admin
- [ ] `mca.admin.bash` — Bash (Admin)
- [ ] `mca.admin.filesystem` — Filesystem (Admin)
- [ ] `mca.admin-infra` — Admin Infra
- [x] `mca.bash` — Bash
- [ ] `mca.board-manager` — Board Manager
- [ ] `mca.board-runner` — Board Runner
- [ ] `mca.conversations` — Conversations
- [ ] `mca.core` — Core
- [ ] `mca.datetime` — DateTime
- [ ] `mca.docker-env` — Docker Environments
- [ ] `mca.feedback` — Feedback
- [ ] `mca.feedback-admin` — Feedback Admin
- [ ] `mca.file-processor` — File Processor
- [x] `mca.filesystem` — Filesystem
- [ ] `mca.granola` — Granola
- [ ] `mca.guide` — Guide
- [ ] `mca.holded` — Holded
- [ ] `mca.http` — HTTP Request
- [ ] `mca.mca-manager` — MCA Manager
- [ ] `mca.memory` — Memory & Vector DB
- [ ] `mca.messaging` — Messaging
- [x] `mca.perplexity` — Perplexity AI
- [x] `mca.playwright` — Playwright
- [ ] `mca.scheduler` — Scheduler & Reminders
- [ ] `mca.webfetch` — Web Fetch

[0.2.2]: https://github.com/agentapps/agentapps/releases/tag/v0.2.2
[0.2.1]: https://github.com/agentapps/agentapps/releases/tag/v0.2.1
[0.2.0]: https://github.com/agentapps/agentapps/releases/tag/v0.2.0
[1.0.0]: https://github.com/agentapps/agentapps/releases/tag/v1.0.0
[0.1.0]: https://github.com/agentapps/agentapps/commits/main
