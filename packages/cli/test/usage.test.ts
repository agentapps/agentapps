/**
 * Version, help and a command line that is not understood (CLI-REQ-11).
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(here, '..', 'src', 'bin.ts');
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;
const home = mkdtempSync(join(tmpdir(), 'agentapps-usage-'));
afterAll(() => rmSync(home, { recursive: true, force: true }));

function agentapps(...args: string[]) {
  const r = spawnSync(process.execPath, ['--import', TSX, BIN, ...args], {
    cwd: home,
    env: { ...process.env, NODE_PATH: '', HOME: home, NO_COLOR: '1' },
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const HINT =
  'Run "agentapps help" to see the commands, or "agentapps" alone to enter the interactive mode.';

describe('asking the CLI what it is and what it does', () => {
  it('[CLI-AC-11] version and help are commands, and what is not understood says what to run', () => {
    const flag = agentapps('--version');
    const command = agentapps('version');
    expect(command.code).toBe(0);
    expect(command.out).toBe(flag.out);
    expect(command.out.trim()).toMatch(/^\d+\.\d+\.\d+/);

    const help = agentapps('help');
    expect(help.code).toBe(0);
    expect(help.out).toContain('Usage: agentapps');

    const option = agentapps('--nope');
    expect(option.code).toBe(2);
    expect(option.out).toContain('Unknown option: --nope');
    expect(option.out).toContain(HINT);

    const unknown = agentapps('nope');
    expect(unknown.code).toBe(2);
    expect(unknown.out).toContain('Unknown command: nope');
    expect(unknown.out).toContain(HINT);
  }, 60_000);
});
