/**
 * @agentapps/cli — REPL loop.
 *
 * Built on Node's `node:repl` rather than a bare `readline` interface so we
 * inherit its line editor for free — history navigation and, notably,
 * reverse-i-search (Ctrl+R) / forward search (Ctrl+S). We never evaluate
 * JavaScript: a custom `eval` routes each line through the agentapps command
 * dispatcher, and a custom `writer` suppresses the usual result echo since the
 * renderer already writes output itself.
 *
 * Interactive commands that read raw stdin (the `config` secret prompt, the
 * `auth` OAuth flow) need exclusive control of the terminal. Instead of
 * tearing the REPL down and rebuilding it, we briefly detach the REPL's own
 * stdin listeners (and drop raw mode) while such a command runs, then reattach
 * them — keeping a single long-lived server so Ctrl+R history stays continuous.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { REPLServer } from 'node:repl';
// A namespace import: the single executable's runtime (Bun) has no `start`, and a
// named import would fail when the module loads, even outside the REPL.
import * as nodeRepl from 'node:repl';
import { dispatchCommand } from './dispatch.js';
import { renderHelp } from './help.js';
import { CYAN, RESET } from './render/colors.js';
import { formatCompletionColumns } from './render/completions.js';
import { createRenderer } from './render/index.js';
import { getCompletionCandidates, parseReplLine, tokenize } from './repl-parser.js';
import { SessionPool } from './session-pool.js';
import type { CliContext, GlobalOptions } from './types.js';

type ParsedCommand = ReturnType<typeof parseReplLine>;

/**
 * Runtime history fields the REPL/readline line editor exposes but that
 * `@types/node`'s `REPLServer` does not surface. `history` is the newest-first
 * array reverse-i-search walks.
 */
interface HistoryStore {
  history: string[];
}

const asHistoryStore = (server: LineEditor | undefined): HistoryStore | undefined =>
  server as unknown as HistoryStore | undefined;

/** What the REPL needs from its line editor: node:repl's server or a readline interface. */
interface LineEditor {
  prompt(preserveCursor?: boolean): void;
  close(): void;
}

export interface ReplOptions {
  ctx: CliContext;
  options: GlobalOptions;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export async function startRepl(options: ReplOptions): Promise<void> {
  const { ctx, options: globalOptions, input = process.stdin, output = process.stdout } = options;
  const stdin = input as NodeJS.ReadStream;
  const historyPath = resolve(dirname(ctx.configPath), '.agentapps', 'history');
  ensureHistoryFile(historyPath);

  const isTTY = output === process.stdout ? (process.stdout.isTTY ?? false) : false;
  const noColor = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '';
  const renderer = createRenderer({
    isTTY,
    noColor,
    format: globalOptions.json ? 'json' : globalOptions.yaml ? 'yaml' : 'human',
    width: isTTY ? (output as NodeJS.WriteStream).columns : undefined,
  });

  const prompt = isTTY && !noColor ? `${CYAN}agentapps>${RESET} ` : 'agentapps> ';

  let server: LineEditor | undefined;
  let finishRepl: (() => void) | undefined;
  // Tracks the in-flight command so teardown (e.g. EOF on piped stdin) waits
  // for it to finish writing before resolving.
  let pending: Promise<void> = Promise.resolve();
  // One live session per alias for the whole REPL run (stateful apps keep
  // their state across commands). Closed on exit.
  const sessions = new SessionPool();

  const completer = (line: string): [string[], string] => {
    const candidates = getCompletionCandidates(line, {
      configPath: ctx.configPath,
      config: ctx.config,
      aliases: [],
      // Shell-only commands (e.g. `completions`) can't run in the REPL, so we
      // must not offer them here.
      includeCliOnly: false,
    });
    const values = candidates.map((c) => c.value);
    // Node's line editor expects [matches, substring] where substring is the
    // portion being completed (the last token). Returning the full line would
    // prevent it from matching candidates correctly.
    const tokens = tokenize(line);
    const lastToken = line.endsWith(' ') ? '' : (tokens[tokens.length - 1] ?? '');

    // When insertion can't make progress (no single match, no longer common
    // prefix), take over the display: print the candidates colorized by kind
    // and redraw the prompt, handing the editor an empty list.
    if (isTTY && values.length > 1) {
      const prefix = commonPrefix(values);
      if (prefix.length <= lastToken.length) {
        const list = formatCompletionColumns(candidates, {
          width: (output as NodeJS.WriteStream).columns,
          colors: { enabled: !noColor },
        });
        output.write(`\n${list}\n`);
        server?.prompt(true);
        return [[], lastToken];
      }
    }
    return [values, lastToken];
  };

  // ── History ────────────────────────────────────────────────────────────
  // A `config <app> KEY:value` line carries secrets (API keys, client secrets)
  // inline, so it must never be written to the history file or be reachable via
  // reverse-i-search. The interactive `config <app>` form (no args) is safe: the
  // value is read through a masked prompt, never the command line.
  const isRecordableHistory = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    const command = parseReplLine(trimmed, {
      configPath: ctx.configPath,
      config: ctx.config,
      aliases: [],
    });
    return !(command.type === 'config' && command.args.length > 0);
  };

  /** Read the history file (oldest-first) into a newest-first list, redacting
   * any secret-bearing lines that predate this policy. */
  const loadHistory = (): string[] => {
    if (!existsSync(historyPath)) return [];
    try {
      return readFileSync(historyPath, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .filter(isRecordableHistory)
        .reverse();
    } catch {
      return [];
    }
  };

  /** Persist the in-memory history (newest-first) back to disk (oldest-first). */
  const persistHistory = (): void => {
    try {
      const hist = asHistoryStore(server)?.history ?? [];
      const lines = [...hist].filter(isRecordableHistory).reverse().slice(-1000);
      writeFileSync(historyPath, lines.length ? `${lines.join('\n')}\n` : '', 'utf8');
    } catch {
      // History is best-effort.
    }
  };

  /** Called once per submitted line: drop it from the editor's history if it
   * must not be recorded, then persist the remainder. */
  const recordHistory = (): void => {
    const store = asHistoryStore(server);
    if (!isTTY || !store?.history) return;
    const hist = store.history;
    // readline already unshifted the just-submitted line at index 0.
    if (hist.length > 0 && !isRecordableHistory(hist[0])) {
      hist.shift();
    }
    persistHistory();
  };

  /** Dispatch a parsed command and render its result (or error). */
  const runCommand = async (command: ParsedCommand): Promise<void> => {
    try {
      const result = await dispatchCommand(command, {
        ctx,
        options: globalOptions,
        input,
        output,
        sessions,
      });
      const rendered = renderer.render(result);
      if (rendered) {
        output.write(`${rendered}\n\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      output.write(
        `${renderer.render({
          success: false,
          error: { message },
        })}\n\n`,
      );
    }
  };

  /**
   * Run `fn` while the REPL relinquishes stdin, so a command can drive the
   * terminal itself (raw-mode secret entry, an OAuth prompt). We snapshot and
   * detach the REPL's own keypress/data listeners, drop raw mode, then restore
   * everything afterwards.
   */
  const withReleasedStdin = async (fn: () => Promise<void>): Promise<void> => {
    const keypressListeners = stdin.listeners('keypress');
    const dataListeners = stdin.listeners('data');
    const wasRaw = isTTY ? (stdin.isRaw ?? false) : false;

    for (const l of keypressListeners) stdin.removeListener('keypress', l as () => void);
    for (const l of dataListeners) stdin.removeListener('data', l as () => void);
    if (isTTY && typeof stdin.setRawMode === 'function') stdin.setRawMode(false);

    try {
      await fn();
    } finally {
      if (isTTY && typeof stdin.setRawMode === 'function') stdin.setRawMode(wasRaw);
      for (const l of keypressListeners) stdin.on('keypress', l as () => void);
      for (const l of dataListeners) stdin.on('data', l as () => void);
      // A prompt's readline pauses stdin when it closes; the REPL must keep reading.
      stdin.resume();
    }
  };

  const evalCommand = (
    cmd: string,
    _context: unknown,
    _filename: string,
    request: (err: Error | null, result?: unknown) => void,
  ): void => {
    // Serialize lines through a promise queue so a command always finishes
    // before the next one starts — even when stdin is piped and the editor
    // reads several lines ahead. `pending` also lets the exit handler wait for
    // the last in-flight command to finish writing.
    pending = pending.then(() => handleLine(cmd));
    pending.then(
      () => request(null),
      (err) => request(err instanceof Error ? err : new Error(String(err))),
    );
  };

  const handleLine = async (cmd: string): Promise<void> => {
    const trimmed = cmd.trim();

    // Redact secret-bearing lines and persist history before doing any work.
    recordHistory();

    if (trimmed === 'exit' || trimmed === 'quit') {
      server?.close(); // teardown happens in the 'exit' handler
      return;
    }

    if (trimmed === '') {
      return;
    }

    if (trimmed === 'clear') {
      output.write('\x1b[2J\x1b[H');
      return;
    }

    if (trimmed === 'help' || trimmed === '?') {
      output.write(`${renderHelp({ enabled: isTTY && !noColor })}\n\n`);
      return;
    }

    const command = parseReplLine(trimmed, {
      configPath: ctx.configPath,
      config: ctx.config,
      aliases: [],
    });

    if (command.type === 'unknown') {
      output.write(
        `${renderer.render({
          success: false,
          error: {
            message: command.token ? `Unknown command: ${command.token}` : 'Empty command',
            suggestion: 'Run "help" to see available commands.',
          },
        })}\n\n`,
      );
      return;
    }

    if (command.type === 'mcp') {
      output.write(
        `${renderer.render({
          success: false,
          error: {
            message: "mcp runs as an agent client's MCP server, not in the REPL.",
            suggestion: 'Register it with: connect claude-code',
          },
        })}\n\n`,
      );
      return;
    }

    // Commands that may ask on the terminal (secret prompts, the OAuth flow,
    // permission approval, uninstall confirmation, an inline Policy approval)
    // need exclusive control of it, or the REPL also takes the answer.
    const needsExclusiveStdin =
      (command.type === 'config' && command.args.length === 0) ||
      command.type === 'auth' ||
      command.type === 'install' ||
      command.type === 'uninstall' ||
      command.type === 'tool';

    if (needsExclusiveStdin) {
      await withReleasedStdin(() => runCommand(command));
    } else {
      await runCommand(command);
    }
  };

  const createServer = (): REPLServer => {
    const repl = nodeRepl.start({
      prompt,
      input,
      output,
      terminal: isTTY,
      // Route every line through our dispatcher instead of the JS evaluator.
      eval: evalCommand as never,
      completer,
      // The renderer already prints results; suppress the REPL's own echo.
      writer: () => '',
      ignoreUndefined: true,
      useColors: !noColor,
      // Node 26 makes `historySize` read-only once the REPL exists.
      historySize: 1000,
    } as Parameters<typeof nodeRepl.start>[0]);

    // Preload history into the REPL's own in-memory store (what reverse-i-search
    // walks) instead of `setupHistory`, so we control exactly what is persisted
    // — secret-bearing `config` lines must never be recorded. Only terminal mode
    // has a line editor / history.
    if (isTTY) {
      const store = asHistoryStore(repl);
      if (store) {
        store.history = loadHistory();
      }
    }

    repl.on('exit', () => {
      void (async () => {
        // Let any in-flight command finish writing (matters for piped stdin,
        // where EOF can arrive before the last command's async work resolves).
        await pending;
        await sessions.closeAll();
        finishRepl?.();
      })();
    });

    return repl;
  };

  /**
   * The line editor when the runtime has no `node:repl` server (the single
   * executable runs on Bun, DIST-REQ-4): readline gives the same prompt,
   * completion and history, without reverse-i-search.
   */
  const createLineEditor = (): LineEditor => {
    const rl = createInterface({
      input,
      output,
      prompt,
      terminal: isTTY,
      completer,
      historySize: 1000,
    });
    if (isTTY) {
      const store = asHistoryStore(rl);
      if (store) store.history = loadHistory();
    }
    let closed = false;
    rl.on('line', (line) => {
      pending = pending.then(() => handleLine(line));
      void pending.then(() => {
        if (!closed) rl.prompt();
      });
    });
    rl.on('close', () => {
      closed = true;
      void (async () => {
        await pending;
        await sessions.closeAll();
        finishRepl?.();
      })();
    });
    rl.prompt();
    return rl;
  };

  return new Promise<void>((resolvePromise) => {
    finishRepl = resolvePromise;
    server = typeof nodeRepl.start === 'function' ? createServer() : createLineEditor();
  });
}

/** Longest prefix shared by all values. */
function commonPrefix(values: string[]): string {
  let prefix = values[0] ?? '';
  for (const value of values) {
    while (prefix && !value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

function ensureHistoryFile(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '', 'utf8');
  }
}
