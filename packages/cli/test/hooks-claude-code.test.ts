/**
 * The Claude Code adapter (HOOK-REQ-26) against a real daemon station:
 * Claude Code's hook JSON in, Claude Code's expected output out.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '@agentapps/sdk';
import { InMemoryDataStore, InMemorySecretStore, StationServer } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  factory as complianceFactory,
  manifest as complianceManifest,
} from '../../../apps/compliance-filter/src/app.js';
import {
  factory as datetimeFactory,
  manifest as datetimeManifest,
} from '../../../apps/datetime/src/app.js';
import {
  CLAUDE_CODE_EVENTS,
  CLAUDE_CODE_HOOK_HOST,
  ClaudeCodeBridge,
  claudeCodeRoute,
  installClaudeCodeHooks,
  runClaudeCodeHook,
} from '../src/commands/hooks-claude-code.js';
import { addInstallation, stateDir } from '../src/state.js';
import { stationMetaPath } from '../src/station-lifecycle.js';
import type { ResolvedApp } from '../src/types.js';

let tmpDir: string;
let configPath: string;
let server: StationServer | undefined;
let bridge: ClaudeCodeBridge | undefined;
let stdout: string[];

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agentapps-cc-'));
  configPath = join(tmpDir, 'agentapps.json');
  writeFileSync(configPath, '{}');
  stdout = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await bridge?.stop();
  await server?.stop();
  bridge = undefined;
  server = undefined;
  rmSync(tmpDir, { recursive: true, force: true });
});

function memoryApp() {
  const app = createApp({
    id: 'app.memory',
    version: '1.0.0',
    name: 'Memory',
    description: 'Remembers conversations',
    author: { name: 'Test', email: 'test@example.com' },
    category: 'samples',
    runtime: { transport: 'stdio', command: 'node', args: ['app.js'] },
    permissions: { hooksConversation: true },
  });
  const dreams: Array<{ closure: number; turns: string[] }> = [];
  app.hook('on-dream', async (_event, ctx) => {
    const turns: string[] = [];
    for await (const turn of ctx.conversation.read(ctx.input.conversationId)) {
      turns.push(`${turn.message.text} -> ${turn.response ?? ''}`);
    }
    dreams.push({ closure: ctx.input.closure, turns });
  });
  return { app, dreams };
}

function resolved(id: string, factory: ResolvedApp['factory'], manifest: Record<string, unknown>) {
  return { id, app: { name: id, sourcePath: tmpDir, factory, manifest } };
}

/** A daemon like `serve` starts: the station with the adapter routes, and station.json. */
async function startDaemon() {
  const memory = memoryApp();
  addInstallation(configPath, 'datetime', 'app.datetime', { hooksContext: true });
  addInstallation(configPath, 'compliance', 'app.compliance-filter', {
    hooksVeto: true,
    hooksConversation: true,
  });
  addInstallation(configPath, 'memory', 'app.memory', { hooksConversation: true });
  bridge = new ClaudeCodeBridge(configPath, [
    resolved(
      'app.datetime',
      datetimeFactory,
      datetimeManifest as unknown as Record<string, unknown>,
    ),
    resolved(
      'app.compliance-filter',
      complianceFactory,
      complianceManifest as unknown as Record<string, unknown>,
    ),
    resolved(
      'app.memory',
      memory.app.toFactory(),
      memory.app.toManifest() as unknown as Record<string, unknown>,
    ),
  ]);
  const b = bridge;
  server = new StationServer({
    stationId: 'stn_test',
    workspaceId: 'ws_test',
    secretStore: new InMemorySecretStore(),
    dataStore: new InMemoryDataStore(),
    publicUrl: 'http://station.test',
    apps: [],
    adminToken: 'admin-secret',
    adminRoutes: Object.fromEntries(
      CLAUDE_CODE_EVENTS.map((e) => [
        claudeCodeRoute(e),
        (body: unknown) => b.handle(e, body as Record<string, unknown>),
      ]),
    ),
  });
  const info = await server.start(0, '127.0.0.1');
  // The command finds the Station where the workspace's CLI does: cli.stationUrl.
  writeFileSync(configPath, JSON.stringify({ apps: [], cli: { stationUrl: info.url } }));
  writeFileSync(
    stationMetaPath(configPath),
    JSON.stringify({
      pid: process.pid,
      port: info.port,
      url: info.url,
      startedAt: '',
      logPath: '',
      adminToken: 'admin-secret',
    }),
  );
  return memory;
}

/** Run the command Claude Code runs and parse what it printed. */
async function claudeCode(event: string, input: Record<string, unknown>) {
  stdout.length = 0;
  const result = await runClaudeCodeHook(configPath, event, JSON.stringify(input));
  expect(result.exitCode).toBe(0);
  const printed = stdout.join('').trim();
  return printed ? (JSON.parse(printed) as Record<string, unknown>) : {};
}

function transcript(path: string, turns: Array<[string, string]>): void {
  const lines = turns.flatMap(([user, assistant], i) => [
    JSON.stringify({
      type: 'user',
      uuid: `u${i}`,
      timestamp: '2026-11-09T10:00:00Z',
      message: { role: 'user', content: user },
    }),
    JSON.stringify({
      type: 'assistant',
      uuid: `a${i}`,
      message: { role: 'assistant', content: [{ type: 'text', text: assistant }] },
    }),
  ]);
  writeFileSync(path, `${lines.join('\n')}\n`);
}

const until = async (check: () => boolean, ms = 3_000) => {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('Claude Code adapter', () => {
  it('[HOOK-AC-3] reports what Claude Code lacks: no transform, no attachments', () => {
    expect(CLAUDE_CODE_HOOK_HOST.name).toBe('claude-code');
    expect(CLAUDE_CODE_HOOK_HOST.supports.transform).toBe(false);
    expect(CLAUDE_CODE_HOOK_HOST.supports.transformAttachments).toBe(false);
  });

  it('[HOOK-AC-29] datetime context on every prompt, a compliance veto blocks, and SessionEnd dreams after Claude Code exits', async () => {
    const memory = await startDaemon();
    const session = {
      session_id: 'cc-1',
      transcript_path: join(tmpDir, 'cc-1.jsonl'),
      cwd: tmpDir,
    };

    const started = await claudeCode('SessionStart', {
      ...session,
      hook_event_name: 'SessionStart',
      source: 'startup',
    });
    expect(started).toEqual({});

    const prompt = await claudeCode('UserPromptSubmit', { ...session, prompt: 'What day is it?' });
    const output = prompt.hookSpecificOutput as {
      hookEventName: string;
      additionalContext: string;
    };
    expect(output.hookEventName).toBe('UserPromptSubmit');
    expect(output.additionalContext).toContain(
      'app="app.datetime" name="Date &amp; Time" label="Current time"',
    );

    const blocked = await claudeCode('UserPromptSubmit', {
      ...session,
      prompt: 'My SSN is 123-45-6789',
    });
    expect(blocked.decision).toBe('block');
    expect(blocked.reason).toContain(
      'app.compliance-filter: Message contains personally identifiable information (SSN)',
    );

    expect(
      await claudeCode('Stop', {
        ...session,
        stop_hook_active: false,
        last_assistant_message: 'It is Monday.',
      }),
    ).toEqual({});

    transcript(session.transcript_path, [['What day is it?', 'It is Monday.']]);
    const ended = Date.now();
    expect(await claudeCode('SessionEnd', { ...session, reason: 'prompt_input_exit' })).toEqual({});
    expect(Date.now() - ended).toBeLessThan(1_500);
    // Claude Code has exited and removed its transcript; the snapshot still answers.
    unlinkSync(session.transcript_path);
    await until(() => memory.dreams.length === 1);
    expect(memory.dreams[0]).toEqual({ closure: 1, turns: ['What day is it? -> It is Monday.'] });
    const snapshots = readdirSync(join(stateDir(configPath), 'transcripts'));
    expect(snapshots).toHaveLength(1);
  });

  it('install writes every event into the chosen settings file and keeps existing hooks', () => {
    const settingsPath = join(tmpDir, '.claude', 'settings.json');
    installClaudeCodeHooks(settingsPath);
    const existing = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: Record<string, unknown[]>;
    };
    existing.hooks.Stop!.push({ hooks: [{ type: 'command', command: 'echo mine' }] });
    writeFileSync(settingsPath, JSON.stringify(existing));
    installClaudeCodeHooks(settingsPath);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string; async?: boolean }> }>>;
    };
    expect(Object.keys(settings.hooks).sort()).toEqual([...CLAUDE_CODE_EVENTS].sort());
    expect(settings.hooks.Stop!.map((g) => g.hooks[0]!.command)).toEqual([
      'agentapps hooks claude-code Stop',
      'echo mine',
    ]);
    expect(settings.hooks.Stop![0]!.hooks[0]!.async).toBe(true);
  });
});
