# Glossary

The open protocol, SDK and reference runtime for applications built for AI agents. An app exposes capabilities (tools, events, UI, hooks) through a single wire protocol; any platform that implements the consuming side can run it. MCP is one compatibility layer over that protocol, not the protocol itself.

> This file is the source of truth for the vocabulary of the project. Every other document, the code and the CLI follow it; when they disagree, this file wins and the rest is adapted.

## Language

### Roles

**Agent App** (or **App**):
A self-contained program that exposes capabilities to agents through the Agent Apps protocol. Identified by a dot-namespaced id such as `app.github`.
_Avoid_: integration, connector, plugin, MCP server

**Host**:
The role that consumes apps on behalf of a user: it discovers apps, opens sessions, calls tools, renders UI and answers the app's requests for secrets, storage and permissions. A Host declares what it can do at handshake; apps degrade when a capability is absent.
_Avoid_: client, consumer, platform, station

**Station**:
The role that runs apps: it spawns and retires instances, proxies protocol traffic between Hosts and instances, and holds the state apps are not allowed to hold (secrets, storage, permissions). `agentapps serve` is a Station.
_Avoid_: controller, server, execution host, app host

**Gateway**:
A stateless translator between a third-party agent protocol (MCP, A2A) and a Station. It holds no secrets, no sessions and no user data. A Gateway is a thin Host.
_Avoid_: bridge, adapter, proxy

**Agent Platform**:
Third-party software the end user talks to (Claude Code, Cursor, an IDE). It reaches apps through a Gateway and never needs to know the Agent Apps protocol exists.
_Avoid_: client, host, IDE

**CLI**:
The `agentapps` command. It is a single-user Host with an embedded Station, used to install, configure, authenticate and exercise apps locally, and to start a standalone Station.
_Avoid_: REPL, tool, client

### App packaging

**Manifest**:
The app's self-description (`agentapp.json`): identity, author, branding, auth needs, how to run it, and every Capability and Permission it declares.
_Avoid_: config, package.json, descriptor

**Installation**:
A record that binds an App to a workspace under an alias, with its own configuration, Installation Secrets, Effective Permissions and Bindings. Created by `install`, identified by a stable `installationId`.
_Avoid_: instance, deployment, copy

**Alias**:
The human-chosen, renameable name of an Installation, such as `gmail-work`. Two installations of the same app differ only by alias and installation id.
_Avoid_: name, handle, instance name

**Instance**:
A running process of an App serving one Installation. Instances are spawned and retired by the Station; an Installation exists whether or not an Instance is running.
_Avoid_: installation, process, container, worker

**Runtime**:
How a Station starts an Instance: in the same process, as a child process, or elsewhere. An implementation concern of the Station, invisible to app authors and to the protocol.
_Avoid_: execution mode, deployment target, transport

**Transport**:
The channel a protocol message travels on: stdio, HTTP, WebSocket or in-memory. Independent of the message format; an app does not change because its transport does.
_Avoid_: runtime, binding, connection

### Protocol

**Session**:
A scoped conversation between a Host and an Instance, identified by `sessionId` and carrying the Tenant. Every capability exchange (tools, events, UI, hooks, storage) happens inside a session.
_Avoid_: connection, conversation, channel

**Control Plane**:
Messages exchanged between Host and Station without a session: handshake, session open and close, health.
_Avoid_: admin plane, management API

**Session Plane**:
Messages carrying a `sessionId`, routed by the Station to one Instance: tool calls, results, events, UI requests, hooks, and the Instance's requests back to the Host.
_Avoid_: data plane, app plane

**Request** (Instance to Host):
A message an Instance sends to its Host to obtain something only the Host owns: secrets, auth, storage, user profile, intents. The Host answers; the Station only proxies and validates.
_Avoid_: callback, upcall, reverse call

**Host Capabilities**:
The set of protocol features a Host declares at handshake: which UI it can render, whether it is multi-user, whether it can push events, which extensions it supports. Apps and Stations adapt to it.
_Avoid_: features, flags, client type

**Capability** (App Capability):
Something an App offers that a Host may use or ignore: tools, events, streaming, renderers, interfaces, screens. Nothing to consent to; what works is the intersection of App and Host Capabilities.
_Avoid_: permission, grant, feature flag

### Capabilities an app can offer

**Tool**:
A named operation with a description, a JSON Schema for its arguments, annotations and a handler. The primary thing an agent calls.
_Avoid_: function, action, command, endpoint

**Annotation**:
A declared, never inferred, behavioural hint on a Tool: read-only, destructive, idempotent, open-world, sensitive. Annotations describe; what to do about them (for instance asking before a sensitive call) is decided by the Policy, not by the App.
_Avoid_: tag, flag, metadata, hint (alone), permission

**Event**:
A named, typed notification an App emits to the Hosts subscribed to it, such as `message_received`. Declared in the manifest; emitted from tool handlers or from the app's own background work.
_Avoid_: notification, webhook, signal, trigger

**Subscription**:
A Host's declared interest, within a session, in one or more of an App's Events. Without a subscription nothing is delivered.
_Avoid_: listener, watcher, hook

**Webhook** (not a protocol concept):
An HTTP endpoint a third-party service calls. How an App receives one is the App's own business; the protocol only sees the Event the App emits afterwards.
_Avoid_: inbound event, inbound subscription

**Hook**:
A point at which the Host hands the conversation to an App: when a prompt is assembled (`session-start`), before and after each turn (`pre-turn`, `post-turn`), before and after a compaction (`pre-compaction`, `post-compaction`) and once per closure of a conversation (`on-dream`; a reopened conversation closes again as a new closure). Shaping hooks are synchronous and bounded by a timeout; notify hooks are fire-and-forget. Low-level, unlike Events.
_Avoid_: conversation hook, middleware, interceptor, lifecycle hook, event

**Hook Power**:
What a Hook may do with the conversation: **context** (contribute attributed text blocks to the prompt), **veto** (block the user's turn) or **transform** (change the user's message before the model sees it). Each power is a separate Permission.
_Avoid_: annotate, hook capability, hook mode, decision

**Chunk**:
The result of a compaction: a selection of turns, contiguous or picked from anywhere in the conversation (tree compaction), replaced in the prompt by one summary with a stable id. Immutable; a later compaction absorbs it into a new Chunk. The record of the original turns stays readable.
_Avoid_: summary, compaction, block, segment

**Lifecycle Handler**:
Code an App runs when an Installation is installed, uninstalled or upgraded, or when a Session opens or closes. Not a hook: it cannot annotate or veto anything.
_Avoid_: lifecycle hook, install hook

**UI Component**:
One building block of a Screen or a Renderer's output. Either **standard**, from the public Agent Apps component library (text, table, list, card, chart, form, tree, detail), or **app-defined**, a sandboxed bundle the App declares in its Manifest for what the standard library does not cover. The Host owns how each is drawn.
_Avoid_: interface, widget, element, UI resource

**Renderer**:
An App-provided presentation for a Tool's result, bound to the tool by name: a set of UI Components the Host draws in its own theme, plus optional text, markdown or HTML fallbacks for Hosts that cannot draw components.
_Avoid_: view, formatter, UI resource, template

**Screen**:
A navigable page of the App composed of UI Components, for apps that need more than inline results. Screens link to one another; the one flagged **launcher** is where the user lands when opening the App from the Host.
_Avoid_: interface, page, view, window, panel

**Storage**:
A document store private to one Installation: named collections of JSON documents with an id, queried by field and updated partially. Every App has it without declaring anything; the platform owns and isolates it. Data shared across Installations is the App's own backend, not Storage.
_Avoid_: database, key-value store, state, cache, data store

**Object**:
An immutable binary file an App uploads and gets a URL for, private to its Installation and available without declaring anything. **Private** by default: the URL works for humans signed in to the Host and, through a Request, for any App of the same Workspace. **Public** objects are permanent and open to anyone with the URL. A private object can also be lent to the outside through a signed **temporary link** that expires.
_Avoid_: file, blob, attachment, share, upload

**Volume**:
The one file area of a Workspace, a directory tree shared by every App that holds the Permission to use it. Accessed in **API mode** (read, write, list, delete through protocol messages) or **mount mode** (the Station hands the Instance a real directory, for apps such as Bash that need POSIX access).
_Avoid_: files, filesystem, bucket, object storage, per-app volume, share

**Requirement**:
A dependency an App declares on a named interface provided by some other installed App, as a list of tool names it needs, such as `messenger: [send_message]`.
_Avoid_: dependency, import, binding, intent

**Binding**:
The user's decision of which Installation fulfils one of an App's Requirements. Created at install or configuration time; changeable without reinstalling.
_Avoid_: link, mapping, wiring, intent

**Intent**:
A call from one App to a Tool of another App, routed by the Host through a Binding. The provider App does not know it is serving an Intent.
_Avoid_: cross-app call, inter-app message, binding call

### Identity and access

**Tenant**:
The identity a Session runs as: a user and, optionally, the Workspace they act in. Tells the App who is calling; isolation of secrets and data is by Installation.
_Avoid_: account, customer, org, user (alone)

**Workspace**:
A shared context in which Installations, system secrets and bindings live. A single-user Host has exactly one implicit Workspace.
_Avoid_: team, org, tenant, project

**System Secret**:
A credential shared by every Installation of an App, such as an OAuth client id and secret. Set by whoever administers the Workspace.
_Avoid_: app secret, global secret, env var

**Installation Secret**:
A credential belonging to one Installation, such as the access token obtained when it was authenticated. Shared by everyone who uses that Installation; a person who wants their own account installs the App again under another Alias. Obtained by auth flows or set by the user; never read from disk by the App.
_Avoid_: user secret, token, credential, personal secret

**Permission**:
Access an App requests in its Manifest to something that is not its own: network egress, the conversation (Hook Powers), the shared Volume, the user's profile, other apps (intents). Approved once, at install time, by the Approver.
_Avoid_: grant, scope, capability

**Effective Permissions**:
The subset of requested Permissions actually approved for an Installation. Sent at session open; an App degrades gracefully when one is missing.
_Avoid_: effective grants, approved scopes

**Principal**:
Who acts through the Station: a human (the admin, an assistant) or an agent (a Gateway, an autonomous agent). Identified by a credential such as an API Key. A single-user Host has one implicit Principal.
_Avoid_: user, account, client, identity

**Policy**:
The named document attached to one Principal stating what it may do, as a list of Rules per app and tool. Written by the admin.
_Avoid_: grant, role, access policy, permission set

**Rule**:
One line of a Policy: an app, a tool, an effect (allow, ask or deny) and optionally a condition on the arguments, such as `to` ending in `@hexagon.sh`.
_Avoid_: permission, statement, entry

**Approver**:
The human who answers an ask: for a tool call whose Rule says ask, or for a Permission at install time. In the current flat model this is always the admin who wrote the Policy.
_Avoid_: admin (alone), reviewer, owner

**Approval**:
The Approver's answer to one ask, given at the moment it happens. A deny ends the call; an approval lets it proceed.
_Avoid_: consent, confirmation, permission

**API Key**:
A credential a Station issues to a Principal so a Host or Gateway can authenticate as it. The Principal's Policy applies to every call made with the key.
_Avoid_: token, bearer, secret, grant
