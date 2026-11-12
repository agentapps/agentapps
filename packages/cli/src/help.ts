/**
 * @agentapps/cli — help text and output formatting.
 */

import { type ColorOptions, color } from './render/colors.js';
import { ENTITY_COLORS, type EntityKind } from './render/theme.js';

export const GLOBAL_HELP = `
Usage: agentapps [command] [options]

Run and exercise Agent Apps locally from a workspace configured with agentapps.json.

Commands:
  apps [query]                       List available apps, filtered by name, tagline, description or keywords
  instances                          List installed apps (installations)
  info <app-id>                      Show app manifest details
  install <app-id> <alias>           Install an app
  uninstall <alias>                  Remove an instance
  rename <alias> <newAlias>          Rename an instance
  status <alias>                     Show instance status
  config <app-id> [key:value...]     Configure app system secrets
  <alias> auth                       Authenticate an instance
  <alias> auth logout                Remove the instance's stored tokens
  <alias> auth reauth                Discard tokens and re-authenticate
  <alias> info                       Show installed instance details
  <alias> tools                      List instance tools
  <alias> tool <name> [args...]      Invoke a tool
  <alias> subscribe <eventType...>   Watch events in the background
  <alias> unsubscribe                Stop the background watcher
  bind <alias> <req> <target>        Bind a requirement to a target instance
  unbind <alias> <req>               Remove a binding
  list-bindings <alias>              Show bindings for an instance
  permissions <alias>                Show every tool's effective permission
  permissions <alias> set <t> <e>    Override a tool (e = allow|ask|deny)
  permissions <alias> remove <t>     Clear a tool's override
  policy [list|show <principal>]     Policies, one per Principal (CLI = admin)
  policy set <p> <app> <tool> <e>    Add a Rule; optional JSON condition last
  policy unset <p> <ruleId>          Remove a Rule
  key create <name> <userId>         New API key; it is a new Principal
  approvals                          Calls waiting for your approval
  approve <id> | deny <id>           Decide a waiting call
  hooks claude-code install <file>   Add conversation hooks to a Claude Code settings file
  hooks claude-code <Event>          Run by Claude Code; forwards the event to the station
  serve [port]                       Start the station in the background (detached)
  station <action>                   Control the station: start|status|stop|restart
  warm                               Warm the tool cache for all installations
  sync                               Install npm: app packages from agentapps.json
  completions <bash|zsh>             Print shell completion script
  help, ?                            Show this help
  exit, quit                         Leave the REPL

Global flags:
  --config <path>     Path to an explicit agentapps.json
  --cwd <dir>         Working directory
  --json              Output raw JSON
  --yaml              Output raw YAML
  --raw               Output raw tool result without human renderer
  --manual-code       Force manual OAuth code entry
  --yes, -y           Skip confirmation prompts
  --verbose, -v       Show extra detail (e.g. tool schemas)
  --help, -h          Show this help

Examples:
  agentapps apps
  agentapps install app.hello.example hello
  agentapps hello auth
  agentapps hello tools --verbose
  agentapps hello tool greet '{"name":"World"}'
  agentapps hello tool greet name:World
  agentapps hello subscribe *
  agentapps hello subscribe calendar_updated
  agentapps hello unsubscribe
  agentapps config app.google.calendar CLIENT_ID:"abc" CLIENT_SECRET:"xyz"
  agentapps completions bash          # eval or append to ~/.bashrc
  agentapps completions zsh           # eval or append to ~/.zshrc
`;

/**
 * Colorize the help text with the entity theme: command names indigo,
 * `<alias>` yellow, `<app-id>` orange, `<name>` green, argument placeholders
 * gray. Returns plain text when colors are disabled.
 */
export function renderHelp(colors: ColorOptions): string {
  const text = GLOBAL_HELP.trim();
  if (!colors.enabled) return text;
  const paint = (kind: EntityKind, s: string): string => color(ENTITY_COLORS[kind], s, colors);

  return (
    text
      // Subcommands right after the alias placeholder (`<alias> tools`).
      .replace(
        /^( {2}<alias> )(\w+)/gm,
        (_m, pre: string, cmd: string) => `${pre}${paint('command', cmd)}`,
      )
      // Leading command names in the Commands section (two-space indent,
      // followed by at least two spaces or an argument).
      .replace(
        /^ {2}([a-z?][\w?-]*(?:, [\w?]+)?)(?=\s{2,}| <)/gm,
        (_m, cmd: string) => `  ${paint('command', cmd)}`,
      )
      // Entity placeholders.
      .replace(/<alias>/g, paint('instance', '<alias>'))
      .replace(/<app-id>/g, paint('app', '<app-id>'))
      .replace(/<name>/g, paint('tool', '<name>'))
      .replace(/\[(?:args|key:value)\.\.\.\]/g, (m) => paint('param', m))
  );
}

/** Print help text to the console. */
export function printHelp(): void {
  const enabled =
    (process.stdout.isTTY ?? false) &&
    !(process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '');
  console.log(renderHelp({ enabled }));
}
