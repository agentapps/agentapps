/**
 * CLI as a Host without UI (docs/specs/host-capabilities.md, HOSTCAP-REQ-4/5).
 * Drives the built CLI against a temporary workspace with todo-list installed.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const bin = join(repo, 'packages/cli/dist/bin.js');

describe('CLI Host Capabilities', () => {
  it.skipIf(!existsSync(bin))(
    '[HOSTCAP-AC-4] the CLI prints the markdown variant of a renderer output',
    { timeout: 60_000 },
    () => {
      const ws = mkdtempSync(join(tmpdir(), 'hostcap-cli-'));
      try {
        writeFileSync(
          join(ws, 'agentapps.json'),
          JSON.stringify({ apps: [{ source: join(repo, 'apps/todo-list') }] }),
        );
        // HOME points at the temp dir so the user's global CLI config is untouched.
        const run = (...args: string[]) =>
          spawnSync(process.execPath, [bin, ...args], {
            cwd: ws,
            env: { ...process.env, HOME: ws, NO_COLOR: '1' },
            encoding: 'utf8',
          });
        expect(run('install', 'app.todo-list', 'todo').status).toBe(0);
        expect(run('todo', 'tool', 'add-node', 'text:Comprar pan').status).toBe(0);
        const out = run('todo', 'tool', 'get-tree');
        expect(out.status, out.stderr).toBe(0);
        const text = `${out.stdout}${out.stderr}`;
        // The tree-view renderer's markdown variant: icon + text per node.
        expect(text).toContain('○ Comprar pan');
        expect(text).not.toContain('nodeId');
      } finally {
        rmSync(ws, { recursive: true, force: true });
      }
    },
  );
});
