/**
 * The CLI as the `admin` Principal's Host (docs/specs/policies.md).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const answers: string[] = [];
vi.mock('../src/prompt.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/prompt.js')>();
  return { ...actual, readLine: async () => answers.shift() ?? '' };
});

const { dispatchCommand } = await import('../src/dispatch.js');
const { addInstallation, getInstallation, getPolicy, putPolicy } = await import('../src/state.js');

import type { CliContext } from '../src/types.js';
import { options, startWorkspace, type TestWorkspace, writeApp } from './support/workspace.js';

let workspace: TestWorkspace;
let ctx: CliContext;
const stdinTTY = process.stdin.isTTY;

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agentapps-cli-policy-'));
  const browser = writeApp(
    join(dir, 'browser'),
    { id: 'app.browser', version: '1.0.0', permissions: { profile: 'basic', volume: true } },
    'export function factory() {}',
  );
  // The Station keeps the Policies and evaluates them; the CLI is its admin.
  workspace = await startWorkspace({
    dir,
    sources: [resolve(__dirname, '../../../apps/hello'), browser],
  });
  ctx = workspace.ctx();
  answers.length = 0;
});

afterEach(async () => {
  process.stdin.isTTY = stdinTTY;
  vi.restoreAllMocks();
  await workspace.stop();
  rmSync(workspace.dir, { recursive: true, force: true });
});

describe('Policies in the CLI', () => {
  it('[POLICY-AC-1] the CLI calls tools as the admin Principal', async () => {
    addInstallation(ctx.configPath, 'hello', 'app.hello');
    const admin = getPolicy(ctx.configPath, 'admin');
    putPolicy(ctx.configPath, {
      ...admin,
      rules: [{ id: 'no-greet', app: 'app.hello', tool: 'greet', effect: 'deny' }],
    });
    // Another Principal's Policy does not apply to the CLI.
    putPolicy(ctx.configPath, { ...getPolicy(ctx.configPath, 'ak_other'), rules: [] });

    const result = await dispatchCommand(
      { type: 'tool', alias: 'hello', toolName: 'greet', args: ['name:World'] },
      { ctx, options: options() },
    );
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("rule 'no-greet'");
  });

  it('[POLICY-AC-2] a new API Key is a Principal whose Policy policy show prints', async () => {
    const created = await dispatchCommand(
      { type: 'key-create', name: 'marianne', userId: 'marianne' },
      { ctx, options: options() },
    );
    const principal = /Principal: (ak_[0-9a-f]+)/.exec(created.message ?? '')?.[1];
    expect(principal).toBeDefined();

    const shown = await dispatchCommand(
      { type: 'policy-show', principalId: principal! },
      { ctx, options: options() },
    );
    const data = shown.data as { default: string; rules: Record<string, { effect: string }> };
    expect(data.default).toBe('allow');
    expect(Object.keys(data.rules)).toEqual(['default-destructive', 'default-sensitive']);
    expect(data.rules['default-sensitive']?.effect).toBe('ask');
  });

  it('[POLICY-AC-17] key names are unique among active keys and policy commands accept them', async () => {
    const run = (command: Parameters<typeof dispatchCommand>[0]) =>
      dispatchCommand(command, { ctx, options: options() });
    const idOf = (message?: string) => /Principal: (ak_[0-9a-f]+)/.exec(message ?? '')?.[1] ?? '';

    const first = idOf(
      (await run({ type: 'key-create', name: 'cursor', userId: 'pablo' })).message,
    );

    const set = await run({
      type: 'policy-set',
      principalId: 'cursor',
      app: 'app.github',
      tool: 'merge-pull',
      effect: 'ask',
    });
    expect(set.success).toBe(true);
    expect(getPolicy(ctx.configPath, first).rules.map((r) => r.id)).toContain(
      'app.github/merge-pull',
    );
    // Nothing was stored under the name itself.
    expect(getPolicy(ctx.configPath, 'cursor').rules.map((r) => r.id)).not.toContain(
      'app.github/merge-pull',
    );
    const shown = await run({ type: 'policy-show', principalId: 'cursor' });
    expect((shown.data as { principal: string }).principal).toBe(first);

    // Names are unique among active keys, so a name always means one Principal.
    const again = await run({ type: 'key-create', name: 'cursor', userId: 'pablo' });
    expect(again.success).toBe(false);
    expect(again.error?.message).toContain('cursor');
    expect((await run({ type: 'policy-show', principalId: 'cursor' })).success).toBe(true);

    const unknown = await run({
      type: 'policy-set',
      principalId: 'nobody',
      app: '*',
      tool: '*',
      effect: 'deny',
    });
    expect(unknown.success).toBe(false);
    expect(getPolicy(ctx.configPath, 'nobody').rules.some((r) => r.effect === 'deny')).toBe(false);
  });

  it('[POLICY-AC-7] an ask prompts inline and the answer decides the call', async () => {
    addInstallation(ctx.configPath, 'hello', 'app.hello');
    const admin = getPolicy(ctx.configPath, 'admin');
    putPolicy(ctx.configPath, {
      ...admin,
      rules: [{ id: 'ask-greet', app: 'app.hello', tool: 'greet', effect: 'ask' }],
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.stdin.isTTY = true;

    answers.push('n');
    const refused = await dispatchCommand(
      { type: 'tool', alias: 'hello', toolName: 'greet', args: ['name:World'] },
      { ctx, options: options() },
    );
    expect(refused.success).toBe(false);
    expect(refused.error?.message).toContain('needs approval');

    answers.push('y');
    const approved = await dispatchCommand(
      { type: 'tool', alias: 'hello', toolName: 'greet', args: ['name:World'] },
      { ctx, options: options() },
    );
    expect(approved.success).toBe(true);
  });

  it('[POLICY-AC-9] install lists high-risk permissions first and waits for a yes', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line?: unknown) => {
      lines.push(String(line));
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    answers.push('no');
    const refused = await dispatchCommand(
      { type: 'install', appId: 'app.browser', alias: 'browser' },
      { ctx, options: options() },
    );
    expect(refused.success).toBe(false);
    expect(getInstallation(ctx.configPath, 'browser')).toBeUndefined();
    const listed = lines.filter((l) => l.startsWith('  [!]') || l.startsWith('  - '));
    expect(listed[0]).toContain('[!] Shared workspace volume');
    expect(listed[1]).toContain('User profile: basic');

    // No answer at all (non-interactive): a clear failure, nothing installed.
    const silent = await dispatchCommand(
      { type: 'install', appId: 'app.browser', alias: 'browser' },
      { ctx, options: options() },
    );
    expect(silent.success).toBe(false);
    expect(silent.error?.message).toContain('no answer was given');
    expect(getInstallation(ctx.configPath, 'browser')).toBeUndefined();

    answers.push('y');
    const installed = await dispatchCommand(
      { type: 'install', appId: 'app.browser', alias: 'browser' },
      { ctx, options: options() },
    );
    expect(installed.success).toBe(true);
    expect(getInstallation(ctx.configPath, 'browser')?.permissions).toEqual({
      profile: 'basic',
      volume: true,
    });
  });
});
