/**
 * `connect claude-code` (CLI-REQ-5) against a stand-in `claude` that records
 * how it was called, and `connect <name>` for any other Agent Platform
 * (CLI-REQ-9).
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleConnect } from '../src/commands/connect.js';
import { loadClientKey } from '../src/secrets-store.js';
import { loadApiKeys } from '../src/state.js';
import type { CliContext, GlobalOptions } from '../src/types.js';

const options: GlobalOptions = {
  json: false,
  yaml: false,
  raw: false,
  manualCode: false,
  urlOnly: false,
  yes: false,
  verbose: false,
  help: false,
};

let dir: string;
let ctx: CliContext;
let log: string;
const originalPath = process.env.PATH;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'agentapps-connect-'));
  const configPath = join(dir, 'agentapps.json');
  writeFileSync(configPath, '{"apps":[]}\n');
  ctx = { cwd: dir, config: { apps: {} }, configPath };
  log = join(dir, 'claude.log');
});

afterEach(() => {
  process.env.PATH = originalPath;
  rmSync(dir, { recursive: true, force: true });
});

/** Put a fake `claude` first on the PATH; it appends its arguments to `log`. */
function fakeClaude(): void {
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const script = join(bin, 'claude');
  writeFileSync(script, `#!/bin/sh\necho "$@" >> "${log}"\n`);
  chmodSync(script, 0o755);
  process.env.PATH = `${bin}:${originalPath}`;
}

const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []);
const connect = (client: string, remove = false) =>
  handleConnect({ type: 'connect', client, remove }, { ctx, options });
const active = (name = 'claude-code') =>
  loadApiKeys(ctx.configPath).filter((k) => k.name === name && !k.revokedAt);

describe('connect', () => {
  it('[CLI-AC-5] registers the gateway with its own key, reuses it, and removes both', async () => {
    fakeClaude();

    const first = await connect('claude-code');
    expect(first.success).toBe(true);
    expect(active()).toHaveLength(1);
    const keyId = active()[0].id;
    expect(loadClientKey(ctx.configPath, 'claude-code')?.keyId).toBe(keyId);
    expect(calls()).toEqual([
      'mcp remove agentapps -s user',
      'mcp add agentapps -s user -- agentapps mcp claude-code',
    ]);
    // The raw key never reaches Claude Code's settings.
    expect(calls().join(' ')).not.toContain('aak_');

    await connect('claude-code');
    expect(active().map((k) => k.id)).toEqual([keyId]);

    rmSync(log);
    const removed = await connect('claude-code', true);
    expect(removed.success).toBe(true);
    expect(calls()).toEqual(['mcp remove agentapps -s user']);
    expect(active()).toHaveLength(0);
    expect(loadClientKey(ctx.configPath, 'claude-code')).toBeUndefined();
  });

  it('[CLI-AC-5] without claude on the PATH it creates the key and prints the command', async () => {
    const empty = join(dir, 'empty');
    mkdirSync(empty);
    process.env.PATH = empty;

    const result = await connect('claude-code');
    expect(result.success).toBe(true);
    expect(result.message).toContain(
      'claude mcp add agentapps -s user -- agentapps mcp claude-code',
    );
    expect(active()).toHaveLength(1);
  });

  it('[CLI-AC-9] any other name gets its own key and the MCP server entry, and claude is not run', async () => {
    fakeClaude();

    const first = await connect('cursor');
    expect(first.success).toBe(true);
    expect(active('cursor')).toHaveLength(1);
    const keyId = active('cursor')[0].id;
    expect(loadClientKey(ctx.configPath, 'cursor')?.keyId).toBe(keyId);
    const entry = JSON.parse((first.message ?? '').slice((first.message ?? '').indexOf('{')));
    expect(entry).toEqual({
      mcpServers: { agentapps: { command: 'agentapps', args: ['mcp', 'cursor'] } },
    });
    expect(first.message).not.toContain('aak_');
    expect(calls()).toEqual([]);

    await connect('cursor');
    expect(active('cursor').map((k) => k.id)).toEqual([keyId]);
    // Each name is its own Principal: Claude Code's key is untouched.
    expect(active('claude-code')).toHaveLength(0);

    const removed = await connect('cursor', true);
    expect(removed.success).toBe(true);
    expect(removed.message).toContain('settings of cursor');
    expect(active('cursor')).toHaveLength(0);
    expect(loadClientKey(ctx.configPath, 'cursor')).toBeUndefined();
    expect(calls()).toEqual([]);
  });

  it('[CLI-AC-9] a name that is not plain lowercase is refused and creates nothing', async () => {
    const result = await connect('My Agent');
    expect(result.success).toBe(false);
    expect(loadApiKeys(ctx.configPath)).toHaveLength(0);
  });
});
