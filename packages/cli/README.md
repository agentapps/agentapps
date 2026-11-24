# `@agentapps/cli`

The command line of Agent Apps: install apps, configure and sign them in, call their tools, connect
an agent platform such as Claude Code, and run the Station that makes all of it work.

The CLI is a client of one **Station**. Every command talks to the Station at `cli.stationUrl`;
nothing runs an app inside the command. A tool called from the terminal and the same tool called
from Claude Code take the same path, under the same Policy.

## Installation

```bash
npm install -g @agentapps/cli
# or run it without installing
npx @agentapps/cli
```

Installed, the command is `agentapps`. Never use `npx agentapps`: the unscoped
`agentapps` package on npm is an unrelated project.

## Quick start

Start a Station, install an app under a name of your choice (the alias) and call one of its tools:

```console
$ agentapps station start
  ✓ Station running in the background at http://localhost:4100
$ agentapps install app.hello hello
$ agentapps hello tool greet name:World
```

With no arguments, `agentapps` opens an interactive mode that takes the same commands and keeps a
history. If the Station is not running, a command says so and how to start it; the interactive mode
offers to start it for you.

Connect the agent platform you use:

```console
$ agentapps connect claude-code
```

`agentapps help` lists every command.

## The Station the CLI talks to

| Command | What it does |
|---|---|
| `station start` \| `stop` \| `restart` \| `status` | Control the Station this workspace starts, in the background. |
| `station use <url>` | Point the CLI at another Station. |
| `station login` \| `logout` | Store or remove the CLI's API Key for that Station. |
| `station apps` | Apps available on the Station. |
| `station apps add <source\|app-id>` | Make an app available (Station Operator). |
| `station apps remove <app-id>` | Stop offering an app (Station Operator). |

For the Station this workspace started, the CLI needs no login. For any other, create an API Key
there (`agentapps key create <name> <userId> role:<role>`) and store it with `station login`. A key
has one of three roles: `station-operator` runs the Station and decides which apps it offers,
`workspace-owner` installs apps and manages keys and Policies in its Workspace, and
`workspace-member` (the default) uses what is installed.

## Apps and Installations

| Command | What it does |
|---|---|
| `apps [query]` | Apps available to install. |
| `install <app-id> <alias>` | Install an app. |
| `installations` | Your Installations and their status. |
| `status <alias>` | One Installation's status. |
| `rename <alias> <newAlias>` | Change an alias. |
| `uninstall <alias>` | Remove an Installation and its secrets. |
| `config <app-id> [KEY:value...]` | An app's system secrets, shared by its Installations (an OAuth client id). |
| `config <alias> [KEY:value...]` | One Installation's secrets (its API key). |
| `config <app-id\|alias> unset <KEY>` | Remove a secret. |
| `<alias> auth` | Sign an Installation in. |
| `<alias> tools` | Its tools. |
| `<alias> tool <name> [args...]` | Call a tool. |

`config <app-id>` with no values shows the app's setup instructions, when it declares them. They
include the redirect URI to register with the service: the Station supplies it, from its
`publicUrl`, and it is never a secret you type.

## Tool arguments

Named arguments or one JSON payload, never both.

```console
$ agentapps gmail tool send-message to:someone@example.com subject:"Hello there" body:"Some text"
$ agentapps gmail tool send-message '{"to":"someone@example.com","subject":"Hello there"}'
$ echo '{"to":"someone@example.com"}' | agentapps gmail tool send-message -
```

- `key:value` for values without spaces; `key:"value with spaces"` otherwise.
- A value starting with `{` or `[` is parsed as JSON: `labels:["a","b"]`.

## Output

- The default is a human-readable view: tables, key-value blocks and labeled sections.
- `--json` and `--yaml` print the raw result in that format.
- `--raw` prints the tool result as it is (the default when stdout is not a terminal).
- Logs and progress go to stderr, so stdout stays clean to pipe.

## Global options

| Option | Description |
|---|---|
| `--config <path>` | Path to an explicit `agentapps.json`. |
| `--cwd <dir>` | Working directory. |
| `--json`, `--yaml`, `--raw` | Output format. |
| `--manual-code` | Type the OAuth code by hand. |
| `--public-url <url>` | Public URL of the Station that `serve` and `station start` launch. |
| `--yes`, `-y` | Skip confirmation prompts. |
| `--verbose`, `-v` | Show extra detail, such as tool schemas. |
| `--help`, `-h` | Show help. |

## Workspace configuration

The CLI reads `agentapps.json` from the working directory or the nearest parent that has one. When
there is none it uses your home workspace, `~/.agentapps/workspace/agentapps.json`, created on first use with
the catalog's apps and these settings:

```json
{
  "station": { "id": "stn_…", "host": "127.0.0.1", "port": 4100, "publicUrl": "http://localhost:4100" },
  "cli": { "stationUrl": "http://localhost:4100" },
  "workspace": { "id": "ws_…" },
  "apps": [{ "source": "npm:@agentapps/app.hello" }, { "source": "./apps/my-app" }]
}
```

- `station` describes the Station this workspace starts. It does not start without an `id` and a
  `publicUrl`, the address others reach it at, which OAuth redirect URIs are built from.
- `cli.stationUrl` is the Station the CLI connects to. On one machine it is the same address.
- `workspace.id` names the Workspace that Station's Installations, keys and Policies belong to.
- `apps` lists the apps the Station offers: an npm package or a local directory with an
  `agentapp.json`. `station apps add` and `station apps remove` edit it.

## Local state

A Station keeps everything next to its `agentapps.json`. In a project, add both directories to
`.gitignore`.

| Path | What it holds |
|---|---|
| `.agentapps/` | The Station's state (Installations, API Keys, Policies), its log, and the Data Store: what apps store, their files and Volume. |
| `.secrets/` | The Secret Store (apps' system secrets, Installations' tokens) and the CLI's own keys for Stations and agent platforms. |

Set secrets with `agentapps config`, never by editing those files.

## Development

```bash
pnpm install
pnpm build
pnpm vitest run packages/cli
```
