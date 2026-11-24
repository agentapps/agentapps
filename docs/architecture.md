# Agent Apps — Architecture

> How the pieces fit together. Vocabulary comes from [`glossary.md`](./glossary.md), which is the source of truth; when this document and the glossary disagree, the glossary wins.

## What it is

Agent Apps is an open protocol for applications built for AI agents. An App exposes Capabilities (tools, events, UI, hooks) through one wire protocol, and any platform that implements the consuming side can run it. MCP is a compatibility layer over the protocol, not the protocol itself: a Gateway translates it, and Agent Platforms such as Claude Code or Cursor never see Agent Apps directly.

## Roles

Five roles. Two of them are defined by the protocol (Host and Station); the other three are the places those roles live.

| Role | What it does | Examples |
|---|---|---|
| **Agent Platform** | Where the user talks to an agent. Third-party software. Reaches apps through a Gateway. | Claude Code, Cursor, Claude Desktop |
| **Gateway** | A stateless, thin Host that translates another protocol (MCP, A2A) into Agent Apps. Holds no secrets, no sessions. | `agentapps mcp` |
| **Host** | The consuming side: discovers apps, opens Sessions, calls Tools, draws UI, answers the Instance's Requests (secrets, storage, permissions). Declares its Host Capabilities at handshake. | the CLI, Teros, any Gateway |
| **Station** | The running side: spawns and retires Instances, proxies traffic between Hosts and Instances, holds what apps may not hold (secrets, Storage, Policies). | `agentapps serve` |
| **App** | The program itself: Tools plus whatever else it offers. | `app.github`, `app.google-gmail` |

The **CLI** is a Host: every command talks to one Station. It is how you install, configure, authenticate and exercise apps, and how you start a Station on your machine.

## Topologies

Every message is the same JSON whatever the topology. Only the cable between two parties changes.

**You, in a terminal.** `agentapps hello tool greet name:World`. Host, Station and Instance share one process; both hops are in-memory calls.

```
┌──────────────────────── agentapps process ────────────────────────┐
│  Host ──in-memory──▶ Station ──in-memory──▶ Instance (hello)      │
└───────────────────────────────────────────────────────────────────┘
```

**Claude Code using Notion.** `agentapps serve` listens on a port; the Gateway speaks MCP on one side and Agent Apps on the other; the Station loads Notion in its own process.

```
┌─────────────┐  MCP   ┌─────────┐  Agent Apps  ┌─────────┐  Agent Apps  ┌──────────┐
│ Claude Code │ ─────▶ │ Gateway │ ───────────▶ │ Station │ ───────────▶ │  Notion  │
│ (Agent      │ stdio  │ (Host)  │   over HTTP  │         │  in memory   │ (Instance)│
│  Platform)  │        │         │              │         │              │          │
└─────────────┘        └─────────┘              └─────────┘              └──────────┘
    hop A                   hop B                    hop C
```

Hop A is not our protocol. Hops B and C carry the same `tool_call`; B travels over HTTP, C in memory: the Station the CLI starts runs every app inside its own process.

**WhatsApp in a container.** Same as above, but the Station cannot write to a container's stdin, so hop C is HTTP to the container's port.

```
Station ──Agent Apps over HTTP──▶ WhatsApp (Instance, Docker, port 3000)
```

## Transport and Runtime

Two different things that the code used to blur.

- **Transport** is the cable of one hop: in-memory, stdio or HTTP. The Manifest declares the transport the Instance speaks (hop C).
- **Runtime** is how the Station starts an Instance: load it in-process, spawn a child process, or talk to a container. It is internal to the Station; an app author never sees it. The Runtime chosen fixes the transport of hop C: a child process speaks stdio, a container speaks HTTP.

## Planes and message flows

**Control Plane**: Host-to-Station messages without a Session: `initialize` / `initialized` (handshake, Host Capabilities), `session_open` / `session_opened`, `session_close`, health.

**Session Plane**: messages with a `sessionId`, routed by the Station to one Instance: tool listing and calls, progress and streams, Events and Subscriptions, Hooks, UI, and Requests.

**A tool call.**

```
Host                      Station                    Instance
 │── session_open ────────▶│── spawn if needed ───────▶│
 │◀─ session_opened ───────│◀─ ready ──────────────────│
 │── tool_call ───────────▶│── tool_call ─────────────▶│  runs the handler
 │◀─ tool_result ──────────│◀─ tool_result ────────────│
 │── session_close ───────▶│  idle timer; stop later   │
```

**A Request.** The Instance needs something only the Host owns. Gmail needs the Installation Secret to call Google:

```
Host                      Station                    Instance
 │◀─ get_installation_secrets ─│◀─ get_installation_secrets ─│
 │── secrets ──────────────▶│── secrets ───────────────▶│  continues the tool
```

The Station validates that the Request belongs to a live Session and proxies it; it never answers on the Host's behalf. Storage, Objects, the Volume, auth flows and Intents all travel as Requests.

**An ask.** A Principal's Policy has a Rule that says ask for this Tool. The Station parks the call and the Approver decides.

```
Gateway (Principal "claude-code") ── tool_call delete_repo ──▶ Station
                                                                │ Rule: ask
                                                                │ notify Approver (the admin)
                                                                │ approve / deny / timeout
Gateway ◀──────────────── tool_result or PERMISSION_DENIED ─────┘
```

Deny at any point ends the call. In the current flat model there is one admin who writes every Policy and answers every ask; a Gateway cannot answer it in place, so the Station must notify the Approver out of band.

## What an App declares

The Manifest carries two kinds of declaration, kept apart on purpose:

- **Capabilities**: what the App offers. Tools, Events, streaming, Renderers, Screens, app-defined UI Components. A Host uses the ones it understands and ignores the rest; the effective set is the intersection with the Host Capabilities.
- **Permissions**: what the App asks for that is not its own. Network egress, Hook Powers, the shared Volume, the user's profile, Intents on other apps. Approved once, at install, by the Approver. What was approved travels as Effective Permissions at `session_open`, and the App degrades when something is missing.

Storage and Objects are private to the Installation and need no declaration.

## Installations, Workspaces and identity

```
Workspace "hexagon"
 ├─ System Secrets per App      CLIENT_ID / CLIENT_SECRET of app.google-gmail
 ├─ Volume                      /workspace, shared by apps holding the Permission
 ├─ Policies per Principal      "pablo-cli", "claude-code", "marianne"
 └─ Installations
     ├─ "gmail-equipo"  (app.google-gmail)   Installation Secrets, Storage, Objects, Bindings
     └─ "tareas"        (app.todo-list)      Installation Secrets, Storage, Objects, Bindings
```

- An **Installation** is a record: App plus Alias plus its own secrets, Storage, Objects, Effective Permissions and Bindings. It exists whether or not anything is running.
- An **Instance** is a running process serving one Installation. The Station spawns one per Installation when a Session opens and retires it when idle.
- A **Tenant** (user, workspace) rides on every Session and tells the App who is calling. Isolation of secrets and data is by Installation, not by Tenant: two people sharing `gmail-equipo` share its account. Someone who wants their own installs again under another Alias.
- Data shared across Installations is the App's own backend, exactly as Todoist's data lives in Todoist. A collaborative multi-workspace app is a SaaS whose Agent App is its client.

## App-to-app: Requirements, Bindings, Intents

An App can depend on another without naming it. A CRM declares a Requirement `messenger: [send_message]`; at install the user binds it to their WhatsApp Installation; at runtime the CRM issues an Intent, `ctx.intent('messenger', 'send_message', …)`, which the Host routes through the Binding. The provider does not know it is serving an Intent. Intents need a Permission.

## Current state versus this document

This document describes the target architecture after the vocabulary review of 2026-11-08. The code lags in these places:

| Area | In the code today | Target |
|---|---|---|
| Naming (done 2026-11-09) | `AppStation` (was `Controller`), Request (was "callback"; the human prompt is `prompt`), `installations.json` and `agentapps installations`, manifest `permissions` (was `grants`), Policy (was the API-key "grant"), Installation Secrets (was user secrets). Kept on the wire because Teros sends or reads them: `controller_health`, `controller_health_status`, `CONTROLLER_AT_CAPACITY`, announce `controllerId` / `controllerUrl` | done |
| Removed on 2026-11-08 | Docker, remote and shard runtimes, the execution host, execution modes (`standalone` / `cluster` / `on-demand`), platform actions and the `core-actions` grant, the WebSocket transport, the manifest's container extension, the `metric`, `health_update` and `credentials_expired` messages, the SDK's Docker helpers, the SDK's webhook receiver and HTTP runtime (WhatsApp runs its own WAHA listener), the `file_share` / `file_revoke`, `volumes_*` and `files_*` families (replaced by Object: `object_put`, `object_get`, `object_delete`, `object_list`, `object_link`, served at `GET /objects/{id}`), the key-value storage family (Storage is the document store: `storage_put`, `storage_get`, `storage_query`, `storage_update`, `storage_delete`, Teros-compatible; key-value is SDK sugar), Interface and the `ui-resources` family (UI is UI Components, Renderers and Screens) | done |
| Host Capabilities (HOSTCAP, implemented 2026-11-09) | declared at initialize, relayed to the Instance as `ctx.host`, `NOT_SUPPORTED` for undeclared features, single-user Hosts enforced, renderer variants on Hosts without UI | done |
| Volume (VOL, implemented 2026-11-09) | one Volume per Workspace gated by the `volume` Permission; API mode with `mkdir`; mount mode in the in-process and child-process Runtimes (`ctx.volume.mountPath`, `AGENTAPPS_VOLUME_PATH`) | done |
| Policies and Approvals (POLICY, implemented 2026-11-09) | one Policy per Principal (API Key, or `admin` for the CLI) with Rules that may test arguments; default Policy allows and asks for `destructiveHint` and `sensitive` tools; asks park for 5 minutes and the admin answers with `GET /approvals` and `POST /approvals/{id}` or `agentapps approvals` / `approve` / `deny`, or inline when the CLI is the caller; `intents` and `profile` Permissions checked by name; install asks for Permissions; signed approval challenges removed | done |
| Hooks (HOOK, implemented 2026-11-09) | six points (`session-start`, `pre-turn`, `post-turn`, `pre-compaction`, `post-compaction`, `on-dream`); context, veto and a transform chain at `pre-turn`; notifications delivered until acknowledged; closures read page by page with `conversation_read`; compaction chunks; `HookDispatcher` and `renderContextRegion` in the Host; `agentapps hooks claude-code` adapter served by `agentapps serve` | done |
