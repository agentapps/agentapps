/**
 * @agentapps/cli — REPL command parser.
 *
 * Parses a single REPL line into a structured command. Aliases are resolved
 * against installed apps; app ids are resolved against the workspace config.
 */

import { getInstallation, loadInstallations } from './state.js';
import { type CachedTool, readCachedTools } from './tools-cache.js';
import type { WorkspaceConfig } from './types.js';

export type ReplCommand =
  | { type: 'apps'; query?: string }
  | { type: 'installations' }
  | { type: 'info'; appId?: string; alias?: string }
  | { type: 'install'; appId: string; alias: string }
  | { type: 'uninstall'; alias: string }
  | { type: 'rename'; alias: string; newAlias: string }
  | { type: 'status'; alias: string }
  | { type: 'config'; appId: string; args: string[] }
  | { type: 'auth'; alias: string; action?: 'logout' | 'reauth' }
  | { type: 'tools'; alias: string }
  | { type: 'tool'; alias: string; toolName: string; args: string[] }
  | { type: 'subscribe'; alias: string; eventTypes: string[]; unsubscribe: boolean }
  | { type: 'bind'; alias: string; bindingName: string; targetAlias: string }
  | { type: 'unbind'; alias: string; bindingName: string }
  | { type: 'list-bindings'; alias: string }
  | { type: 'permissions'; alias: string }
  | {
      type: 'permissions-set';
      alias: string;
      tool: string;
      effect: 'allow' | 'ask' | 'deny';
    }
  | { type: 'permissions-remove'; alias: string; tool: string }
  | { type: 'policy-list' }
  | { type: 'policy-show'; principalId: string }
  | {
      type: 'policy-set';
      principalId: string;
      app: string;
      tool: string;
      effect: 'allow' | 'ask' | 'deny';
      /** JSON of the Rule's condition (POLICY-REQ-3). */
      when?: string;
    }
  | { type: 'policy-unset'; principalId: string; ruleId: string }
  | { type: 'policy-delete'; principalId: string }
  | { type: 'key-list' }
  | { type: 'connect'; client: string; remove: boolean }
  | { type: 'mcp'; keyName: string }
  | { type: 'key-create'; name: string; userId: string; workspaceId?: string }
  | { type: 'hooks-claude-code'; event: string }
  | { type: 'hooks-claude-code-install'; settingsPath: string }
  | { type: 'approvals' }
  | { type: 'approval-decide'; id: string; decision: 'approve' | 'deny' }
  | { type: 'key-revoke'; keyId: string }
  | { type: 'serve'; port?: number; stationUrl?: string }
  | {
      type: 'station';
      action: 'start' | 'status' | 'stop' | 'restart';
      port?: number;
      stationUrl?: string;
    }
  | { type: 'warm' }
  | { type: 'sync' }
  | { type: 'help' }
  | { type: 'exit' }
  | { type: 'clear' }
  | { type: 'usage'; command: string; usage: string }
  | { type: 'unknown'; token: string };

const TOP_LEVEL_COMMANDS = new Set([
  'apps',
  'installations',
  'info',
  'install',
  'uninstall',
  'rename',
  'status',
  'config',
  'bind',
  'unbind',
  'list-bindings',
  'permissions',
  'policy',
  'key',
  'connect',
  'mcp',
  'serve',
  'station',
  'warm',
  'approvals',
  'hooks',
  'approve',
  'deny',
  'sync',
  'help',
  '?',
  'exit',
  'quit',
  'clear',
]);

const ALIAS_SUBCOMMANDS = new Set(['auth', 'info', 'tools', 'tool', 'subscribe', 'unsubscribe']);

/**
 * One-line usage for commands that require arguments. When such a command is
 * typed without them we return a `usage` result (a clear "Usage: …" hint)
 * instead of the misleading "Unknown command".
 */
const USAGE: Record<string, string> = {
  info: 'info <app-id>',
  install: 'install <app-id> <alias>',
  uninstall: 'uninstall <alias>',
  rename: 'rename <alias> <new-alias>',
  status: 'status <alias>',
  config: 'config <app-id> [key:value...]',
  bind: 'bind <alias> <req> <target>',
  unbind: 'unbind <alias> <req>',
  'list-bindings': 'list-bindings <alias>',
  permissions: 'permissions <alias> [set <tool> <allow|ask|deny> | remove <tool>]',
  'permissions set': 'permissions <alias> set <tool> <allow|ask|deny>',
  'permissions remove': 'permissions <alias> remove <tool>',
  station: 'station <start|status|stop|restart>',
};

function usage(command: string): ReplCommand {
  return { type: 'usage', command, usage: USAGE[command] ?? command };
}

function isEffect(value: string): value is 'allow' | 'ask' | 'deny' {
  return value === 'allow' || value === 'ask' || value === 'deny';
}

export interface ParseReplOptions {
  configPath: string;
  config: WorkspaceConfig;
  aliases: string[];
  /**
   * Whether to offer shell-only commands (see {@link CLI_ONLY_COMMANDS}) as
   * completion candidates. Defaults to `true` for shell completion; the REPL
   * passes `false` since those commands can't run inside it.
   */
  includeCliOnly?: boolean;
}

/** Parse a REPL line into a command (tokenizes the line first). */
export function parseReplLine(line: string, options: ParseReplOptions): ReplCommand {
  const tokens = tokenize(line);
  return parseReplTokens(tokens, options);
}

/** Parse pre-tokenized command tokens into a command (one-shot mode). */
export function parseReplTokens(tokens: string[], options: ParseReplOptions): ReplCommand {
  if (tokens.length === 0) {
    return { type: 'unknown', token: '' };
  }

  const [first, second, third, ...rest] = tokens;

  // Top-level commands.
  if (TOP_LEVEL_COMMANDS.has(first)) {
    if (first === 'apps') {
      const query = tokens.slice(1).join(' ');
      return query ? { type: 'apps', query } : { type: 'apps' };
    }
    if (first === 'installations') return { type: 'installations' };
    if (first === 'info') {
      if (!second) return usage('info');
      return { type: 'info', appId: second };
    }
    if (first === 'help' || first === '?') return { type: 'help' };
    if (first === 'exit' || first === 'quit') return { type: 'exit' };
    if (first === 'clear') return { type: 'clear' };
    if (first === 'serve') {
      const port = second ? parseInt(second, 10) : undefined;
      const stationUrl = third || undefined;
      return { type: 'serve', port: port && !Number.isNaN(port) ? port : undefined, stationUrl };
    }
    if (first === 'station') {
      const action = second;
      if (action !== 'start' && action !== 'status' && action !== 'stop' && action !== 'restart') {
        return usage('station');
      }
      const port = third ? parseInt(third, 10) : undefined;
      const stationUrl = rest[0] || undefined;
      return {
        type: 'station',
        action,
        port: port && !Number.isNaN(port) ? port : undefined,
        stationUrl,
      };
    }
    if (first === 'connect') {
      // connect <client> [--remove]
      const args = tokens.slice(1);
      const client = args.find((t) => t !== '--remove');
      if (!client) return { type: 'unknown', token: 'connect' };
      return { type: 'connect', client, remove: args.includes('--remove') };
    }
    if (first === 'mcp') {
      if (!second) return { type: 'unknown', token: 'mcp' };
      return { type: 'mcp', keyName: second };
    }
    if (first === 'warm') return { type: 'warm' };
    if (first === 'sync') return { type: 'sync' };
    if (first === 'install') {
      if (!second || !third) return usage('install');
      return { type: 'install', appId: second, alias: third };
    }
    if (first === 'uninstall') {
      if (!second) return usage('uninstall');
      return { type: 'uninstall', alias: second };
    }
    if (first === 'rename') {
      if (!second || !third) return usage('rename');
      return { type: 'rename', alias: second, newAlias: third };
    }
    if (first === 'status') {
      if (!second) return usage('status');
      return { type: 'status', alias: second };
    }
    if (first === 'config') {
      if (!second) return usage('config');
      return { type: 'config', appId: second, args: [third, ...rest].filter(Boolean) };
    }
    if (first === 'bind') {
      if (!second || !third || !rest[0]) return usage('bind');
      return { type: 'bind', alias: second, bindingName: third, targetAlias: rest[0] };
    }
    if (first === 'unbind') {
      if (!second || !third) return usage('unbind');
      return { type: 'unbind', alias: second, bindingName: third };
    }
    if (first === 'list-bindings') {
      if (!second) return usage('list-bindings');
      return { type: 'list-bindings', alias: second };
    }
    if (first === 'policy') {
      // policy list | show <principal> | set <principal> <app> <tool> <effect> [when-json]
      // | unset <principal> <ruleId> | delete <principal>
      const args = [third, ...rest].filter((t): t is string => Boolean(t));
      if (!second || second === 'list') return { type: 'policy-list' };
      if (second === 'show') {
        if (!args[0]) return { type: 'unknown', token: 'policy show' };
        return { type: 'policy-show', principalId: args[0] };
      }
      if (second === 'set') {
        const [principalId, app, tool, effect, ...when] = args;
        if (!principalId || !app || !tool || !effect || !isEffect(effect))
          return { type: 'unknown', token: 'policy set' };
        return {
          type: 'policy-set',
          principalId,
          app,
          tool,
          effect,
          ...(when.length > 0 ? { when: when.join(' ') } : {}),
        };
      }
      if (second === 'unset') {
        if (!args[0] || !args[1]) return { type: 'unknown', token: 'policy unset' };
        return { type: 'policy-unset', principalId: args[0], ruleId: args[1] };
      }
      if (second === 'delete') {
        if (!args[0]) return { type: 'unknown', token: 'policy delete' };
        return { type: 'policy-delete', principalId: args[0] };
      }
      return { type: 'unknown', token: `policy ${second ?? ''}` };
    }

    if (first === 'hooks') {
      // hooks claude-code <Event> | hooks claude-code install <settings.json>
      if (second !== 'claude-code' || !third) return { type: 'unknown', token: 'hooks' };
      if (third === 'install') {
        if (!rest[0]) return { type: 'unknown', token: 'hooks claude-code install' };
        return { type: 'hooks-claude-code-install', settingsPath: rest[0] };
      }
      return { type: 'hooks-claude-code', event: third };
    }

    if (first === 'approvals') return { type: 'approvals' };
    if (first === 'approve' || first === 'deny') {
      if (!second) return { type: 'unknown', token: first };
      return {
        type: 'approval-decide',
        id: second,
        decision: first === 'approve' ? 'approve' : 'deny',
      };
    }

    if (first === 'key') {
      // Arguments start at the third token: [key, <sub>, arg0, arg1, ...]
      const args = [third, ...rest].filter((t): t is string => Boolean(t));
      if (!second || second === 'list') return { type: 'key-list' };
      if (second === 'create') {
        // key create <name> <userId> [workspaceId]: the key is a new Principal.
        if (!args[0] || !args[1]) return { type: 'unknown', token: 'key create' };
        return { type: 'key-create', name: args[0], userId: args[1], workspaceId: args[2] };
      }
      if (second === 'revoke') {
        if (!args[0]) return { type: 'unknown', token: 'key revoke' };
        return { type: 'key-revoke', keyId: args[0] };
      }
      return { type: 'unknown', token: `key ${second ?? ''}` };
    }

    if (first === 'permissions') {
      if (!second) return usage('permissions');
      // permissions <alias> — view every tool's effective permission
      // permissions <alias> set <tool> <allow|ask|deny>
      // permissions <alias> remove <tool>
      if (third === 'set') {
        if (!rest[0] || !rest[1]) return usage('permissions set');
        const effect = rest[1] as 'allow' | 'ask' | 'deny';
        if (effect !== 'allow' && effect !== 'ask' && effect !== 'deny')
          return usage('permissions set');
        return { type: 'permissions-set', alias: second, tool: rest[0], effect };
      }
      if (third === 'remove') {
        if (!rest[0]) return usage('permissions remove');
        return { type: 'permissions-remove', alias: second, tool: rest[0] };
      }
      return { type: 'permissions', alias: second };
    }
  }

  // Alias subcommands.
  const instance = getInstallation(options.configPath, first);
  if (instance) {
    // A bare alias shows the instance info.
    if (!second) return { type: 'info', alias: first };

    // Explicit subcommands.
    if (second === 'auth') {
      if (!third) return { type: 'auth', alias: first };
      if (third === 'logout' || third === 'reauth')
        return { type: 'auth', alias: first, action: third };
      return { type: 'unknown', token: `auth ${third}` };
    }
    if (second === 'info') return { type: 'info', alias: first };
    if (second === 'tools') return { type: 'tools', alias: first };
    if (second === 'tool') {
      // `<alias> tool` without a name falls back to listing the tools.
      if (!third) return { type: 'tools', alias: first };
      return { type: 'tool', alias: first, toolName: third, args: rest };
    }
    if (second === 'subscribe') {
      const eventTypes = tokens.slice(2);
      if (eventTypes.length === 0) return { type: 'unknown', token: `${first} subscribe` };
      return { type: 'subscribe', alias: first, eventTypes, unsubscribe: false };
    }
    if (second === 'unsubscribe')
      return { type: 'subscribe', alias: first, eventTypes: [], unsubscribe: true };

    // If the second token is not a reserved subcommand, treat it as a tool name.
    return { type: 'tool', alias: first, toolName: second, args: [third, ...rest].filter(Boolean) };
  }

  return { type: 'unknown', token: first };
}

/** Tokenize a REPL line respecting quoted strings. */
export function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const ch of line) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Commands that are only available from the shell (not the REPL) but should
 * still appear in shell completion candidates.
 */
const CLI_ONLY_COMMANDS = new Set(['completions']);

/** What a completion candidate refers to — drives colorization in the REPL. */
export type CompletionKind = 'command' | 'alias' | 'app' | 'tool' | 'param' | 'value';

export interface CompletionCandidate {
  value: string;
  kind: CompletionKind;
}

function toCandidates(kind: CompletionKind, values: Iterable<string>): CompletionCandidate[] {
  return [...values].map((value) => ({ value, kind }));
}

/**
 * Build completion candidates for the current partial line.
 *
 * If the line ends with a space, a virtual empty token is appended so the
 * logic naturally moves to the next argument position.
 */
export function getCompletionCandidates(
  partial: string,
  options: ParseReplOptions,
): CompletionCandidate[] {
  const rawTokens = tokenize(partial);
  const instances = loadInstallations(options.configPath);
  const aliases = instances.map((i) => i.alias);
  const appIds = Object.keys(options.config.apps);

  const includeCliOnly = options.includeCliOnly !== false;
  const commandCandidates = [
    ...toCandidates('command', TOP_LEVEL_COMMANDS),
    ...(includeCliOnly ? toCandidates('command', CLI_ONLY_COMMANDS) : []),
  ];

  // Trailing space means we're completing the *next* position.
  const trailingSpace = partial.length > 0 && partial.endsWith(' ');
  const tokens = trailingSpace ? [...rawTokens, ''] : rawTokens;

  if (tokens.length === 0) {
    return [...commandCandidates, ...toCandidates('alias', aliases)];
  }

  const first = tokens[0];
  const completing = tokens[tokens.length - 1]; // '' when starting a new position

  // --- Position 0: first token ---
  if (tokens.length === 1) {
    const prefix = completing.toLowerCase();
    return [
      ...commandCandidates,
      ...toCandidates('alias', aliases),
      ...toCandidates('app', appIds),
    ].filter((c) => c.value.toLowerCase().startsWith(prefix));
  }

  // --- After a top-level command ---
  if (TOP_LEVEL_COMMANDS.has(first) || (includeCliOnly && CLI_ONLY_COMMANDS.has(first))) {
    // Position 1 — argument right after the command
    if (tokens.length === 2) {
      if (first === 'install' || first === 'config' || first === 'info') {
        return toCandidates(
          'app',
          appIds.filter((id) => id.startsWith(completing)),
        );
      }
      if (
        first === 'uninstall' ||
        first === 'rename' ||
        first === 'status' ||
        first === 'list-bindings' ||
        first === 'permissions' ||
        first === 'bind' ||
        first === 'unbind'
      ) {
        return toCandidates(
          'alias',
          aliases.filter((a) => a.startsWith(completing)),
        );
      }
      if (first === 'completions') {
        return toCandidates(
          'value',
          ['bash', 'zsh'].filter((s) => s.startsWith(completing)),
        );
      }
      if (first === 'station') {
        return toCandidates(
          'value',
          ['start', 'status', 'stop', 'restart'].filter((s) => s.startsWith(completing)),
        );
      }
    }

    // Position 2+
    if (first === 'install' && tokens.length === 3) {
      // install <appId> <alias> — alias is free-form, suggest existing aliases as hints
      return toCandidates(
        'alias',
        aliases.filter((a) => a.startsWith(completing)),
      );
    }
    if (first === 'rename' && tokens.length === 3) {
      // rename <alias> <newAlias> — free-form
      return [];
    }
    if (first === 'permissions' && tokens.length === 3) {
      return toCandidates(
        'value',
        ['set', 'remove'].filter((c) => c.startsWith(completing)),
      );
    }
    if (first === 'permissions' && tokens.length === 4 && tokens[2] === 'set') {
      // permissions <alias> set <permission> — permissions are app-specific, can't suggest statically
      return [];
    }
    if (first === 'permissions' && tokens.length === 5 && tokens[2] === 'set') {
      return toCandidates(
        'value',
        ['allow', 'deny'].filter((e) => e.startsWith(completing)),
      );
    }
    if (first === 'bind' && tokens.length === 4) {
      // bind <alias> <bindingName> <targetAlias>
      return toCandidates(
        'alias',
        aliases.filter((a) => a.startsWith(completing)),
      );
    }
    return [];
  }

  // --- After an alias ---
  if (aliases.includes(first)) {
    const instance = instances.find((i) => i.alias === first);
    const cachedTools = instance ? readCachedTools(options.configPath, instance.appId) : [];
    const toolNames = cachedTools.map((t) => t.name);

    if (tokens.length === 2) {
      // The parser accepts `<alias> <toolName>` as a shortcut for
      // `<alias> tool <toolName>`, so cached tool names complete here too.
      return [
        ...toCandidates('command', ALIAS_SUBCOMMANDS),
        ...toCandidates('tool', toolNames),
      ].filter((c) => c.value.startsWith(completing));
    }
    if (tokens.length === 3 && tokens[1] === 'tool') {
      return toCandidates(
        'tool',
        toolNames.filter((t) => t.startsWith(completing)),
      );
    }

    // Tool argument positions — `<alias> tool <name> <args…>` or the bare
    // `<alias> <name> <args…>` shortcut. Suggest `param:` keys from the cache.
    const toolName =
      tokens[1] === 'tool' ? tokens[2] : ALIAS_SUBCOMMANDS.has(tokens[1]) ? undefined : tokens[1];
    if (toolName) {
      const tool = cachedTools.find((t) => t.name === toolName);
      if (tool) {
        return toCandidates('param', paramCompletions(tool, tokens, completing));
      }
    }
    // After other subcommands — event types etc. are app-specific
    return [];
  }

  return [];
}

/** `name:` completions for a tool's parameters, skipping ones already typed. */
function paramCompletions(tool: CachedTool, tokens: string[], completing: string): string[] {
  const used = new Set(
    tokens
      .filter((t) => t !== completing && t.includes(':'))
      .map((t) => t.slice(0, t.indexOf(':'))),
  );
  const available = tool.params.filter((p) => !used.has(p.name));
  // Required parameters first — they're what the user has to fill in.
  const ordered = [...available.filter((p) => p.required), ...available.filter((p) => !p.required)];
  return ordered.map((p) => `${p.name}:`).filter((v) => v.startsWith(completing));
}

/** Plain-string completion values (shell completion and readline insertion). */
export function getCompletions(partial: string, options: ParseReplOptions): string[] {
  return getCompletionCandidates(partial, options).map((c) => c.value);
}
