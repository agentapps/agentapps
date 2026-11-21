# `@agentapps/cli`

A command-line tool to install, run and exercise Agent Apps locally from a workspace.

The CLI is primarily an **interactive REPL** that keeps state across commands (installed instances,
authentication tokens, etc.). Every REPL command can also be executed as a one-shot command by
passing it as arguments to `agentapps`.

The visual style is inspired by modern CLIs such as `gh` and `wrangler`: colored status badges,
aligned tables, emoji glyphs, and concise success/error messages.

## Installation

```bash
npm install -g @agentapps/cli
# or run it without installing
npx @agentapps/cli
```

Installed, the command is `agentapps` (or `aa`). Never use `npx agentapps`: the unscoped
`agentapps` package on npm is an unrelated project.

## Quick start

Create an `agentapps.json` in your workspace root:

```json
{
  "apps": [
    { "source": "./apps/hello" },
    { "source": "./apps/gmail" }
  ]
}
```

Each source directory must contain an `agentapp.json` manifest with a canonical `id` field. The CLI
reads each manifest to derive the app id — there is no need to declare ids in `agentapps.json`.

Then run the REPL:

```text
$ agentapps
agentapps> list-apps

  App ID              Name
  ─────────────────────────────
  app.hello   Hello
  app.google.gmail  Gmail

agentapps> install app.hello hello

  ✓ Installed hello (app.hello)

agentapps> hello tools

  Tool    Description
  ─────────────────────────────
  greet   Greet a person by name

agentapps> hello tool greet name:World

  ✓ Greeting

  Message: Hello, World!
```

Or run one-shot commands:

```bash
agentapps list-apps
agentapps install app.hello hello
agentapps hello tool greet name:World
```

## REPL commands

| Command | Description |
|---------|-------------|
| `list-apps` | List apps available in `agentapps.json`. |
| `list` | List installed apps (installations). |
| `install <appId> <alias>` | Install an app with a local alias. |
| `uninstall <alias>` | Remove an instance and its secrets. |
| `rename <alias> <newAlias>` | Rename an instance alias. |
| `status <alias>` | Show instance metadata and auth status. |
| `<alias> auth` | Start the OAuth/auth flow for the instance. |
| `<alias> tools` | List tools exposed by the instance. |
| `<alias> tool <toolName> [args...]` | Invoke a tool. |
| `help`, `?` | Show available commands. |
| `exit`, `quit` | Leave the REPL. |

## Tool arguments

Tools can be invoked with named arguments or a single JSON payload. They cannot be mixed.

### Named arguments

```text
agentapps> gmail tool send_message to:someone@example.com subject:"Hola hoy" msg:"example of content"
```

- `key:value` for values without spaces.
- `key:"value with spaces"` or `key:'value with spaces'`.
- Values starting with `{` or `[` are parsed as JSON: `attachments:[{"name":"file.pdf"}]`.

### JSON payload

```text
agentapps> gmail tool send_message {"to":"someone@example.com","subject":"Hola hoy","msg":"some message"}
```

Or from stdin using `-`:

```bash
echo '{"to":"someone@example.com"}' | agentapps gmail tool send_message -
```

## Output

- **Default output format is a human-readable structured view** (tables, key-value blocks, and
  labeled sections).
- `--json` forces raw JSON output.
- `--yaml` forces raw YAML output.
- `--raw` disables the human renderer and shows the tool result as-is (default when stdout is not a
  TTY).
- Logs and progress go to **stderr**, so stdout stays clean and pipeable.

## Global options

| Option | Description |
|--------|-------------|
| `--config <path>` | Path to an explicit `agentapps.json`. |
| `--cwd <dir>` | Working directory. |
| `--json` | Output raw JSON. |
| `--yaml` | Output raw YAML. |
| `--raw` | Output raw tool result without human renderer. |
| `--manual-code` | Force manual OAuth code entry. |
| `--yes`, `-y` | Skip confirmation prompts. |
| `--verbose`, `-v` | Show extra detail (e.g. tool schemas). |
| `--help`, `-h` | Show help. |

## Workspace configuration

The CLI reads `agentapps.json` from the current working directory, searching upward through parent
directories. v1 supports **local sources only**.

```json
{
  "apps": [
    { "source": "./apps/hello" },
    { "source": "./apps/gmail" }
  ]
}
```

- `apps` — an array of `{ "source" }` entries. Each source directory must contain an `agentapp.json`
  manifest with a canonical `id` field.
- `source` — local path to an app project directory that exports a `factory`.

## Local state

Local state is stored in `.agentapps/` inside the workspace. Add it to `.gitignore`.

| File | Purpose |
|------|---------|
| `.agentapps/installations.json` | Installed instances. |
| `.agentapps/installation-secrets/<alias>.json` | Installation secrets per instance. |
| `.agentapps/history` | REPL command history. |

## Architecture

For each command that touches an installed instance, the CLI:

1. Loads `agentapps.json`.
2. Resolves the app's `factory` (prefers `dist/app.js`, falls back to `src/app.ts` under a TypeScript loader).
3. Boots a `AppStation` + `InProcessRuntime` + `AgentAppHost`.
4. Opens a session.
5. Performs the action.
6. Shuts down cleanly.

Authentication and secrets are handled through the host callbacks defined in `packages/cli/src/host.ts`.

## Development

```bash
pnpm install
pnpm build
pnpm --filter @agentapps/cli test
```

## Status

This is the REPL redesign. The following are not yet implemented:

- `aa` alias.
- Custom tool renderers (built-in human/yaml/json renderers only).
- Remote/npm app sources, `serve` mode, Docker runtime selection.
