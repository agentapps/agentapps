/**
 * The saved workspace only follows runs that found their config on their own
 * (CLI-REQ-4). `homedir()` points at a temporary directory so the real
 * `~/.agentapps/config.json` is never touched.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const home = vi.hoisted(() => {
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs');
  const { tmpdir } = require('node:os') as typeof import('node:os');
  const { join } = require('node:path') as typeof import('node:path');
  return mkdtempSync(join(tmpdir(), 'agentapps-home-'));
});

vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  return { ...os, homedir: () => home };
});

const { findConfigPath, rememberWorkspace, saveGlobalWorkspace } = await import('../src/config.js');

const root = mkdtempSync(join(tmpdir(), 'agentapps-ws-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

function workspace(name: string): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agentapps.json'), '{"apps":[]}\n');
  return dir;
}

const saved = () =>
  (
    JSON.parse(readFileSync(join(home, '.agentapps', 'config.json'), 'utf8')) as {
      workspace: string;
    }
  ).workspace;

describe('remembering the workspace', () => {
  it('[CLI-AC-4] --config leaves the saved workspace alone; a run inside a workspace moves it', () => {
    const a = workspace('a');
    const b = workspace('b');
    saveGlobalWorkspace(a);

    rememberWorkspace(join(b, 'agentapps.json'), true);
    expect(saved()).toBe(a);

    const found = findConfigPath(b);
    expect(found).toBe(join(b, 'agentapps.json'));
    rememberWorkspace(found as string, false);
    expect(saved()).toBe(b);
  });
});
