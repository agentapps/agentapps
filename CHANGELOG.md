# Changelog

All notable changes to the Agent Apps monorepo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/agentapps/agentapps/releases/tag/v1.0.0
[0.1.0]: https://github.com/agentapps/agentapps/commits/main
