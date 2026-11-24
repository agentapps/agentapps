/**
 * @agentapps/cli — Claude Code adapter for conversation hooks (HOOK-REQ-26).
 *
 * Claude Code runs `agentapps hooks claude-code <Event>` as a command hook.
 * The command only forwards Claude Code's JSON to the serve daemon and prints
 * the answer; the daemon hosts the apps and a HookDispatcher, so
 * notifications are delivered durably after Claude Code has moved on.
 *
 *   SessionStart       → session-start (reason `compacted` when source is `compact`)
 *   UserPromptSubmit   → pre-turn (context as additionalContext, veto as block)
 *   Stop               → post-turn (ignored when stop_hook_active)
 *   PreCompact         → pre-compaction (preserved blocks injected at the next SessionStart)
 *   PostCompact        → post-compaction
 *   SessionEnd         → on-dream (the transcript is snapshotted first)
 */

import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  AgentAppHost,
  CONTEXT_SAFETY_INSTRUCTION,
  type ConversationRef,
  type HookApp,
  HookDispatcher,
  type HookSession,
} from '@agentapps/host';
import {
  type AppPermissions,
  type ConversationTurn,
  createInProcessTransportPair,
  type HookEntry,
  type HookHost,
  type HookToolCall,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { loadWorkspaceConfig } from '../config.js';
import { loadInstallations, stateDir } from '../state.js';
import { stationCredential } from '../station-client.js';
import type { HandlerResult, ResolvedApp } from '../types.js';

/** The Claude Code events the adapter handles. */
export const CLAUDE_CODE_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'Stop',
  'PreCompact',
  'PostCompact',
  'SessionEnd',
] as const;
export type ClaudeCodeEvent = (typeof CLAUDE_CODE_EVENTS)[number];

/** Notify events: Claude Code never waits on them. */
const NOTIFY_EVENTS: ReadonlySet<string> = new Set(['Stop', 'PostCompact', 'SessionEnd']);

/** Claude Code caps `additionalContext` at 10 000 characters. */
const ADDITIONAL_CONTEXT_CAP = 10_000;

/** Pre-compaction input is cut to about 8 000 tokens (HOOK-REQ-4). */
const SEGMENT_CHARS = 32_000;

/**
 * Claude Code as hooks see it: no transform and no attachments (HOOK-REQ-3).
 *
 * @spec HOOK-REQ-26
 */
export const CLAUDE_CODE_HOOK_HOST: HookHost = {
  name: 'claude-code',
  supports: {
    transform: false,
    transformAttachments: false,
    history: true,
    preservedContext: true,
    onDream: true,
    conversationRead: true,
  },
  budgets: { perApp: 500, session: 2_000, turn: 2_000, preserved: 1_000 },
  notifyRetention: 'PT24H',
  readPageSize: 50,
};

/** Every installation of the local CLI belongs to its one agent. */
const AGENT_ID = 'claude-code';

/**
 * The admin route the daemon answers for one event.
 *
 * @spec HOOK-REQ-26
 */
export function claudeCodeRoute(event: string): string {
  return `/hooks/claude-code/${event}`;
}

interface ClaudeCodeInput {
  session_id?: string;
  transcript_path?: string;
  source?: string;
  prompt?: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
  compact_summary?: string;
  reason?: string;
}

interface SessionState {
  pendingTurn?: { turnId: string; text: string };
  turnIds: string[];
  lastSelection: string[];
}

/**
 * The daemon side: one HookDispatcher over the installed apps that declare
 * hooks, answering each Claude Code event.
 *
 * @spec HOOK-REQ-26
 */
export class ClaudeCodeBridge {
  readonly dispatcher: HookDispatcher;
  private readonly apps: HookApp[] = [];
  private readonly sessions = new Map<string, SessionState>();
  private readonly closers: Array<() => Promise<void>> = [];
  private started?: Promise<void>;

  constructor(
    private readonly configPath: string,
    private readonly resolved: Array<{ id: string; app: ResolvedApp }>,
    options: { now?: () => Date } = {},
  ) {
    this.dispatcher = new HookDispatcher({
      host: CLAUDE_CODE_HOOK_HOST,
      apps: () => this.apps,
      ...(options.now ? { now: options.now } : {}),
    });
  }

  /** Open a session to every installed app that declares hooks. */
  private start(): Promise<void> {
    this.started ??= (async () => {
      for (const installation of loadInstallations(this.configPath)) {
        const entry = this.resolved.find((r) => r.id === installation.appId);
        const hooks = entry?.app.manifest?.hooks as HookEntry[] | undefined;
        if (!entry || !hooks || hooks.length === 0) continue;
        const station = new AppStation({
          appId: entry.id,
          appVersion: String(entry.app.manifest?.version ?? '0.0.0'),
          runtime: new InProcessRuntime(entry.app.factory),
        });
        const [hostSide, stationSide] = createInProcessTransportPair();
        station.accept(stationSide);
        const host = new AgentAppHost(hostSide, {
          host: { name: 'agentapps-cli', version: '1.0.0' },
          requests: {
            onConversationRead: (sessionId, request) =>
              this.dispatcher.readConversation(sessionId, request),
          },
        });
        await host.initialize();
        const session = await host.openSession({
          installationId: installation.installationId,
          tenant: { userId: 'local' },
        });
        this.apps.push({
          appId: entry.id,
          appName: String(entry.app.manifest?.name ?? entry.app.name),
          installationId: installation.installationId,
          agentIds: [AGENT_ID],
          hooks,
          permissions: (installation.permissions ?? {}) as AppPermissions,
          session: session as HookSession,
        });
        this.closers.push(async () => {
          await host.shutdown();
          await station.shutdown();
        });
      }
    })();
    return this.started;
  }

  async stop(): Promise<void> {
    this.dispatcher.stop();
    for (const close of this.closers.splice(0)) await close();
  }

  /** Answer one Claude Code event with the JSON Claude Code expects. */
  async handle(event: string, input: ClaudeCodeInput): Promise<Record<string, unknown>> {
    await this.start();
    const sessionId = input.session_id ?? 'unknown';
    // Claude Code runs on the user's machine, so its locale and timezone are the user's.
    const { locale, timeZone } = Intl.DateTimeFormat().resolvedOptions();
    const ref: ConversationRef = {
      conversationId: sessionId,
      agentId: AGENT_ID,
      userId: 'local',
      locale,
      timezone: timeZone,
    };
    const state = this.sessions.get(sessionId) ?? { turnIds: [], lastSelection: [] };
    this.sessions.set(sessionId, state);

    switch (event) {
      case 'SessionStart': {
        const compacted = input.source === 'compact';
        await this.dispatcher.sessionStart(ref, compacted ? 'compacted' : 'opened');
        const parts = [
          CONTEXT_SAFETY_INSTRUCTION,
          this.dispatcher.sessionRegion(sessionId),
          compacted ? this.dispatcher.preservedRegion(sessionId) : '',
        ].filter((p) => p.length > 0);
        return parts.length > 1 ? additionalContext('SessionStart', parts.join('\n\n')) : {};
      }

      case 'UserPromptSubmit': {
        const turnId = randomUUID();
        const text = input.prompt ?? '';
        const outcome = await this.dispatcher.preTurn(ref, {
          turnId,
          message: { text, attachments: [] },
        });
        if (outcome.vetoed) {
          return {
            decision: 'block',
            reason: outcome.vetoes.map((v) => `${v.app}: ${v.reason}`).join('\n'),
          };
        }
        state.pendingTurn = { turnId, text };
        return outcome.region ? additionalContext('UserPromptSubmit', outcome.region) : {};
      }

      case 'Stop': {
        if (input.stop_hook_active) return {};
        const last = input.transcript_path ? readTurns(input.transcript_path).at(-1) : undefined;
        const turnId = state.pendingTurn?.turnId ?? last?.turnId ?? randomUUID();
        state.turnIds.push(turnId);
        this.dispatcher.postTurn(ref, {
          turnId,
          message: { text: state.pendingTurn?.text ?? last?.message.text ?? '', attachments: [] },
          response: input.last_assistant_message ?? last?.response ?? '',
          toolCalls: last?.toolCalls ?? [],
        });
        state.pendingTurn = undefined;
        return {};
      }

      case 'PreCompact': {
        state.lastSelection = [...state.turnIds];
        const segment = input.transcript_path
          ? readTurns(input.transcript_path)
              .map((t) => `user: ${t.message.text}\nassistant: ${t.response ?? ''}`)
              .join('\n')
              .slice(-SEGMENT_CHARS)
          : '';
        // PreCompact cannot add context; the blocks go out with the next SessionStart.
        await this.dispatcher.preCompaction(ref, { selection: state.lastSelection, segment });
        return {};
      }

      case 'PostCompact': {
        this.dispatcher.postCompaction(ref, {
          selection: state.lastSelection,
          summary: input.compact_summary ?? '',
        });
        return {};
      }

      case 'SessionEnd': {
        // Snapshot now: Claude Code may rewrite or remove the transcript.
        const turns = input.transcript_path
          ? this.snapshot(sessionId, input.transcript_path)
          : undefined;
        this.dispatcher.close(ref, input.reason ?? 'other', turns ? { turns } : {});
        this.sessions.delete(sessionId);
        return {};
      }

      default:
        return {};
    }
  }

  /** Copy the transcript next to the CLI state and read the turns from the copy. */
  private snapshot(sessionId: string, transcriptPath: string): ConversationTurn[] | undefined {
    if (!existsSync(transcriptPath)) return undefined;
    const dir = join(stateDir(this.configPath), 'transcripts');
    mkdirSync(dir, { recursive: true });
    const copy = join(dir, `${sessionId}-${Date.now()}.jsonl`);
    copyFileSync(transcriptPath, copy);
    return readTurns(copy);
  }
}

function additionalContext(hookEventName: string, text: string): Record<string, unknown> {
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext: text.slice(0, ADDITIONAL_CONTEXT_CAP),
    },
  };
}

// ---------------------------------------------------------------------------
// Transcript reading
// ---------------------------------------------------------------------------

interface TranscriptLine {
  type?: string;
  uuid?: string;
  timestamp?: string;
  message?: { role?: string; content?: unknown };
}

interface ContentBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

/**
 * Turns of a Claude Code transcript (JSONL): a turn starts at each user line
 * with text, collects the assistant's text and tool calls, and pairs each
 * tool call with its result.
 *
 * @spec HOOK-REQ-26
 */
export function readTurns(transcriptPath: string): ConversationTurn[] {
  if (!existsSync(transcriptPath)) return [];
  const turns: ConversationTurn[] = [];
  const pendingCalls = new Map<string, HookToolCall>();
  for (const raw of readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!raw.trim()) continue;
    let line: TranscriptLine;
    try {
      line = JSON.parse(raw) as TranscriptLine;
    } catch {
      continue;
    }
    const content = line.message?.content;
    const blocks: ContentBlock[] =
      typeof content === 'string'
        ? [{ type: 'text', text: content }]
        : Array.isArray(content)
          ? content
          : [];
    if (line.type === 'user') {
      const text = blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('\n');
      for (const b of blocks.filter((x) => x.type === 'tool_result')) {
        const call = b.tool_use_id ? pendingCalls.get(b.tool_use_id) : undefined;
        if (call) {
          call.status = b.is_error ? 'error' : 'success';
          call.result = b.content;
        }
      }
      if (text) {
        turns.push({
          turnId: line.uuid ?? `turn-${turns.length + 1}`,
          at: line.timestamp ?? new Date(0).toISOString(),
          message: { text, attachments: [] },
          toolCalls: [],
        });
      }
    } else if (line.type === 'assistant') {
      const turn = turns.at(-1);
      if (!turn) continue;
      const text = blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('\n');
      if (text) turn.response = turn.response ? `${turn.response}\n${text}` : text;
      for (const b of blocks.filter((x) => x.type === 'tool_use')) {
        const [, server, tool] = /^mcp__(.+?)__(.+)$/.exec(b.name ?? '') ?? [];
        const call: HookToolCall = {
          app: server ?? 'claude-code',
          tool: tool ?? b.name ?? 'unknown',
          arguments: b.input ?? {},
          status: 'success',
        };
        turn.toolCalls.push(call);
        if (b.id) pendingCalls.set(b.id, call);
      }
    }
  }
  return turns;
}

// ---------------------------------------------------------------------------
// The command Claude Code runs
// ---------------------------------------------------------------------------

/**
 * `agentapps hooks claude-code <Event>`: forward stdin to the daemon and print
 * its answer. Without a daemon it prints nothing, so Claude Code carries on.
 *
 * @spec HOOK-REQ-26
 */
export async function runClaudeCodeHook(
  configPath: string,
  event: string,
  stdin: string,
): Promise<HandlerResult> {
  if (!(CLAUDE_CODE_EVENTS as readonly string[]).includes(event)) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `Unknown Claude Code event: ${event}`,
        suggestion: CLAUDE_CODE_EVENTS.join(', '),
      },
    };
  }
  // CLIENT-REQ-1: the Station the workspace's CLI connects to, with its credential.
  const url = loadWorkspaceConfig(configPath).cli?.stationUrl?.replace(/\/+$/, '');
  if (!url) {
    process.stderr.write(
      'agentapps: this workspace names no Station; set one with `agentapps station use <url>`\n',
    );
    return { success: true, exitCode: 0 };
  }
  const token = stationCredential(configPath, url)?.token;
  // SessionEnd allows Claude Code about 1.5 s; the daemon answers notify events at once.
  const timeoutMs = event === 'SessionEnd' ? 1_000 : NOTIFY_EVENTS.has(event) ? 3_000 : 8_000;
  try {
    const res = await fetch(`${url}${claudeCodeRoute(event)}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: stdin || '{}',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (Object.keys(body).length > 0) process.stdout.write(`${JSON.stringify(body)}\n`);
  } catch (err) {
    process.stderr.write(
      `agentapps: hook ${event} skipped: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  return { success: true, exitCode: 0 };
}

/**
 * `agentapps hooks claude-code install <settings.json>`: add the adapter to a
 * Claude Code settings file, keeping every hook already there.
 *
 * @spec HOOK-REQ-26
 */
export function installClaudeCodeHooks(settingsPath: string, command = 'agentapps'): HandlerResult {
  const settings: Record<string, unknown> = existsSync(settingsPath)
    ? (JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>)
    : {};
  const hooks = (settings.hooks ?? {}) as Record<
    string,
    Array<{ matcher?: string; hooks: unknown[] }>
  >;
  for (const event of CLAUDE_CODE_EVENTS) {
    const line = `${command} hooks claude-code ${event}`;
    const groups = hooks[event] ?? [];
    const present = groups.some((g) =>
      g.hooks.some((h) => (h as { command?: string }).command === line),
    );
    if (!present) {
      groups.push({
        hooks: [{ type: 'command', command: line, ...(event === 'Stop' ? { async: true } : {}) }],
      });
    }
    hooks[event] = groups;
  }
  settings.hooks = hooks;
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return {
    success: true,
    exitCode: 0,
    message: `Claude Code hooks installed in ${settingsPath}. Keep a station running: agentapps serve`,
  };
}
