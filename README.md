# Agent Apps

[![CI](https://github.com/agentapps/agentapps/actions/workflows/ci.yml/badge.svg)](https://github.com/agentapps/agentapps/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/supertowers/9681b338d54e3f17f94493e6c25b056b/raw/coverage-badge.json)](https://github.com/agentapps/agentapps/actions/workflows/ci.yml)
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
- **Station**: runs apps, proxies traffic, holds secrets and storage. `agentapps serve`.
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

The packages are not published to npm yet; everything runs from this repository.

## Install

You need **git**, **curl** and **Node 24 or 26** (26 recommended; these are the versions CI tests). Nothing below needs sudo.

**1. Node.js.** If `node --version` does not print v24 or v26, install Node 26 for your user with [fnm](https://github.com/Schniz/fnm) or [nvm](https://github.com/nvm-sh/nvm):

```bash
# fnm
curl -fsSL https://fnm.vercel.app/install | bash
fnm install 26 && fnm default 26

# or nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
nvm install 26
```

Open a new terminal afterwards.

**2. pnpm.** It comes with Node through corepack: `corepack enable`. If that says permission denied (a system-wide Node), skip it: `install.sh` links pnpm into `~/.local/bin` for you.

**3. Agent Apps.** The repository is private for now: you need access to the agentapps GitHub organization and an SSH key on your GitHub account.

```bash
git clone git@github.com:agentapps/agentapps.git
cd agentapps
./install.sh
```

The script installs dependencies, builds the packages, and symlinks `agentapps` into `~/.local/bin`. It never uses sudo and never stops to ask a question. If `~/.local/bin` is not on your `PATH`, it adds it to your shell rc file. Open a new terminal and try the sample app:

```console
$ agentapps install app.hello hello
  ✓ Installed hello (app.hello)
$ agentapps hello tools
  greet  name:<string> language:<string>?
      Greet a person by name. Returns a personalized greeting message.
$ agentapps hello tool greet name:World
  message: Hello, World!

  ✓ greet succeeded
```

`agentapps apps` lists every app in the catalog and `agentapps info <app id>` shows one. The browser app works the same way: `agentapps install app.playwright browser`, then `agentapps browser tool navigate url:https://example.com`. On Linux, Chromium also needs system libraries, installed once by someone with sudo: `cd apps/playwright && sudo env "PATH=$PATH" npx playwright install-deps chromium`.

After pulling changes, run `pnpm build` to recompile; the `agentapps` symlink points to compiled output, so it updates automatically.

## Using Agent Apps from Claude Code, Cursor and other MCP clients

Start a station serving your installed apps, then add the [MCP Gateway](https://github.com/agentapps/gateway-mcp) to your client:

```bash
# Start a station on port 4100
agentapps serve 4100

# Add the gateway to Claude Code
claude mcp add agentapps \
  -e CONTROLLER_URL=http://localhost:4100 \
  -- node /path/to/gateway-mcp/dist/index.js
```

The [Gateway setup guide](https://github.com/agentapps/gateway-mcp/blob/main/docs/setup.md) has the snippets for Claude Code, Claude Desktop, Cursor, Windsurf, VS Code and Zed.

## Writing an app

Scaffold one into the catalog, check it against the repository rules, and test it:

```bash
node packages/create/dist/cli.js <id> --base-url <url> [--auth api-key --secrets KEY]
node packages/create/dist/cli.js check-app apps/<id>
pnpm vitest run apps/<id>
```

[`AGENTS.md`](./AGENTS.md) has the rules every app follows: manifest fields, tool annotations, branding assets, secrets. The `create-agent-app` skill in `.agents/skills/` walks a coding agent through the whole process. [`CONTRIBUTING.md`](./CONTRIBUTING.md) says how a change gets into `main`.

## Development

```bash
pnpm install
pnpm build     # tsc -b
pnpm test      # vitest
pnpm lint      # biome
```

Versioning and publishing go through [changesets](https://github.com/changesets/changesets): add one with `pnpm changeset` in your PR.

## License

[MIT](./LICENSE)
