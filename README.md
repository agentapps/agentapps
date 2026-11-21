# Agent Apps

[![CI](https://github.com/agentapps/agentapps/actions/workflows/ci.yml/badge.svg)](https://github.com/agentapps/agentapps/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-24%20%7C%2026-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Agent Apps** are applications built for AI agents. An app gives an agent tools to act, UI to show what it did, events to tell it what happened, and hooks to take part in the conversation itself. The platform gives the app what it may not own: credentials, storage, permissions and a place to run.

This repository holds the open protocol, the SDK to write apps, the Station that runs them, the CLI to use them locally, and a catalog of apps for popular services.

MCP is a compatibility layer, not the protocol: a Gateway translates it so Claude Code, Cursor and other agent platforms can use Agent Apps without knowing they exist.

## What an app can offer

| Capability | What it is |
|---|---|
| **Tools** | Operations an agent calls, with typed arguments, annotations (read-only, destructive, sensitive) and structured results |
| **Renderers** | How a tool's result is presented: declarative UI components the host draws in its own theme, with text and markdown fallbacks |
| **Screens** | Navigable pages composed of UI components, for apps that need more than inline results |
| **Events** | Typed notifications the app emits to subscribed hosts: a message arrived, a calendar event was created |
| **Hooks** | Points where the host pauses and asks the app to annotate, veto or transform what is happening in the conversation |
| **Intents** | Calls to tools of other apps, routed through user-chosen bindings |

## What the platform provides

| Service | What it is |
|---|---|
| **Secrets** | System secrets shared by every installation of an app, and installation secrets obtained by OAuth or set by the user. Apps never read them from disk |
| **Storage** | A document store private to each installation |
| **Objects** | Immutable files the app uploads and gets a URL for, private or public |
| **Volume** | The workspace's shared file area, mounted or accessed through the API, for apps that hold the permission |
| **Permissions and policies** | What an app may touch, approved at install; what each principal may call, decided by rules the admin writes |

The vocabulary is defined in [`docs/glossary.md`](./docs/glossary.md) and the pieces fit together as described in [`docs/architecture.md`](./docs/architecture.md).

## Architecture

```
Agent Platform ── MCP ──▶ Gateway ── Agent Apps ──▶ Station ── Agent Apps ──▶ App instance
(Claude Code)             (Host)     over HTTP                  over stdio
```

- **App**: your code, built with `@agentapps/sdk`.
- **Station**: runs apps, proxies traffic, holds secrets and storage. `agentapps station start`.
- **Host**: consumes apps on behalf of a user. The CLI is a single-user host with an embedded station.
- **Gateway**: a thin host that translates another protocol, such as MCP.

## Packages

| Package | Description |
|---|---|
| [`@agentapps/protocol`](./packages/protocol) | The wire format: message schemas (Zod), control and session planes, error codes |
| [`@agentapps/sdk`](./packages/sdk) | App authoring: tools, events, hooks, UI, storage, lifecycle |
| [`@agentapps/station`](./packages/station) | Instance lifecycle, traffic proxy, secrets, OAuth, policies |
| [`@agentapps/host`](./packages/host) | Host-side client: what a platform or gateway embeds to consume apps |
| [`@agentapps/cli`](./packages/cli) | The `agentapps` command: install, configure, authenticate and call apps locally; start a station |
| [`@agentapps/testing`](./packages/testing) | Test harness for app authors |
| [`@agentapps/create`](./packages/create) | Scaffolding, validation, health checks and dev mode for new apps |

## Install

You need **Node 24 or 26**.

```bash
npm install -g @agentapps/cli
```

That gives you the `agentapps` command (`aa` for short). To try it without installing, use `npx @agentapps/cli`. The package is always `@agentapps/cli`: the unscoped `agentapps` package on npm is an unrelated project.

Install an app under a name of your choice, the alias, and call one of its tools:

```console
$ agentapps install app.hello hello
  Downloading app.hello…
  ✓ Installed hello (app.hello)
$ agentapps hello tools
  greet  name:<string> language:<string>?
      Greet a person by name. Returns a personalized greeting message.
$ agentapps hello tool greet name:World
  message: Hello, World!

  ✓ greet succeeded
```

`agentapps apps` lists the catalog and `agentapps info <app id>` describes one app. Apps are downloaded when you install them. An app for a service needs that service's credentials: `agentapps github-work auth` after `agentapps install app.github github-work`, for example. You can install the same app more than once under different aliases, such as `github-work` and `github-personal`.

## Connecting an agent

Start a Station, which runs your installed apps, and connect the agent platform you use:

```console
$ agentapps station start
$ agentapps connect claude-code
  ✓ API key claude-code created (ak_…); its Policy: policy show ak_…
Claude Code runs "agentapps mcp claude-code" as the MCP server "agentapps".

Open a new Claude Code session to use your Installations.
```

For any other platform that speaks MCP (Codex, Cursor, Gemini CLI, VS Code, Windsurf, Zed), `agentapps connect <name>` creates the key and prints the MCP server entry to add to that platform's settings:

```console
$ agentapps connect cursor
Add this MCP server to the settings of cursor:
{
  "mcpServers": {
    "agentapps": {
      "command": "agentapps",
      "args": [
        "mcp",
        "cursor"
      ]
    }
  }
}
```

Each connection has its own API key, so each agent is a Principal with its own Policy. The key stays in the workspace's secret store, never in the platform's settings. The agent sees your Installations as tools named `<alias>__<tool>`.

You decide what each agent may do. A rule allows a tool, denies it, or makes the call wait for your approval:

```bash
agentapps policy set cursor app.github merge-pull-request ask
agentapps policy set claude-code app.todo-list delete-node deny
```

## Writing an app

Start a project of your own with the scaffolder. It includes the test harness and the `create-agent-app` skill, which walks a coding agent through research, tool design, tests and a live check:

```bash
npm create @agentapps <app-id>
```

To add an app to this repository's catalog instead, clone it and scaffold into `apps/`:

```bash
node packages/create/dist/cli.js <id> --base-url <url> [--auth api-key --secrets KEY]
node packages/create/dist/cli.js check-app apps/<id>
pnpm vitest run apps/<id>
```

[`AGENTS.md`](./AGENTS.md) has the rules every app follows: manifest fields, tool annotations, branding assets, secrets. [`CONTRIBUTING.md`](./CONTRIBUTING.md) says how to propose a change.

## Development

You need git, Node 24 or 26 and pnpm (`corepack enable`).

```bash
git clone https://github.com/agentapps/agentapps.git
cd agentapps
./install.sh   # installs, builds and links `agentapps` into ~/.local/bin, without sudo
```

Inside the clone the CLI uses the repository's own apps, including the ones that are not published to npm yet, such as the browser app: `agentapps install app.playwright browser`.

```bash
pnpm build     # tsc -b
pnpm test      # vitest
pnpm lint      # biome
```

After pulling changes, run `pnpm build` again. Versioning and publishing go through [changesets](https://github.com/changesets/changesets): add one with `pnpm changeset` in your PR.

## License

[MIT](./LICENSE)
