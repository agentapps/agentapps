/**
 * Manifest and tool-surface checks for the Playwright Agent App.
 *
 * Keep the three lists below in sync with the tools in src/tools/.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeParseAppManifest } from '@agentapps/protocol';
import { describe, expect, it, vi } from 'vitest';

// The app imports `playwright`: give it the fake, never the real browser library.
vi.mock('playwright', async () => (await import('./fake-playwright.js')).playwrightModule);

import { app } from '../src/app.js';
import { listTools } from './harness.js';

/** Every tool, sorted. */
const EXPECTED_TOOLS = [
  'click',
  'close',
  'console-clear',
  'console-errors',
  'console-messages',
  'drag',
  'emulate-device',
  'evaluate',
  'file-upload',
  'fill-form',
  'handle-dialog',
  'hover',
  'install',
  'navigate',
  'navigate-back',
  'network-requests',
  'press-key',
  'resize',
  'run-code',
  'select-option',
  'snapshot',
  'start-recording',
  'stop-recording',
  'tabs',
  'take-screenshot',
  'type',
  'wait-for',
];
/**
 * Tools that pause for approval by default: the ones that act on a live web page or on the
 * user's machine. Tools that only change the app's own browser or buffers are not sensitive.
 */
const SENSITIVE_TOOLS = [
  'click',
  'drag',
  'evaluate',
  'file-upload',
  'fill-form',
  'handle-dialog',
  'install',
  'press-key',
  'run-code',
  'select-option',
  'type',
];
/** Tools whose effect on a web page the app cannot undo (submit, send, delete, run code). */
const DESTRUCTIVE_TOOLS = [
  'click',
  'evaluate',
  'file-upload',
  'fill-form',
  'handle-dialog',
  'press-key',
  'run-code',
  'type',
];
/** Tools that change nothing anywhere. */
const READ_ONLY_TOOLS = ['console-errors', 'console-messages', 'network-requests', 'wait-for'];

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(APP_DIR, 'agentapp.json'), 'utf-8'));

describe('Playwright: manifest', () => {
  it('passes the protocol schema', () => {
    const result = safeParseAppManifest(manifest);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    expect(manifest.id).toBe('app.playwright');
  });

  it('matches the createApp() config in src/app.ts', () => {
    const checkedIn = safeParseAppManifest(manifest);
    const generated = safeParseAppManifest(app.toManifest());
    expect(checkedIn.success && generated.success).toBe(true);
    if (!checkedIn.success || !generated.success) return;
    expect(generated.data).toEqual(checkedIn.data);
  });

  it('declares no auth and no secrets', () => {
    expect(manifest.auth.type).toBe('none');
    expect(manifest.auth.installationSecrets ?? []).toEqual([]);
    expect(manifest.auth.systemSecrets ?? []).toEqual([]);
  });

  // Logos come from the service's official brand resources only, never generated.
  // A missing file stays a TODO (with where you searched in the README) until one exists.
  for (const key of ['logo', 'logoMono'] as const) {
    const file = join(APP_DIR, manifest[key]);
    if (existsSync(file)) {
      it(`ships ${key} (${manifest[key]})`, () => {
        if (key === 'logoMono') {
          // The host tints the mono logo, so it must carry no colours of its own.
          expect(readFileSync(file, 'utf-8')).not.toMatch(/fill="#|fill:\s*#|<style/);
        }
      });
    } else {
      it.todo(`${key}: add ${manifest[key]} from an official source (see README, Logos)`);
    }
  }

  // The manifest also names `icon`, and that file was never added to the app.
  if (!existsSync(join(APP_DIR, manifest.icon))) {
    it.todo(`icon: agentapp.json names "${manifest.icon}" but the file does not exist`);
  }
});

describe('Playwright: tools', () => {
  it('lists exactly the expected tools', async () => {
    const tools = await listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS);
    expect(tools).toHaveLength(27);
  });

  it('declares every annotation explicitly on every tool', async () => {
    // Annotations are declared by the author, never inferred from tool names.
    const hints = [
      'readOnlyHint',
      'destructiveHint',
      'idempotentHint',
      'openWorldHint',
      'sensitive',
    ];
    for (const tool of await listTools()) {
      for (const hint of hints) {
        expect(typeof tool.annotations?.[hint], `${tool.name} does not declare ${hint}`).toBe(
          'boolean',
        );
      }
    }
  });

  it('marks exactly the expected tools as sensitive, destructive and read-only', async () => {
    const tools = await listTools();
    const where = (hint: string) =>
      tools
        .filter((t) => t.annotations?.[hint] === true)
        .map((t) => t.name)
        .sort();
    expect(where('sensitive')).toEqual(SENSITIVE_TOOLS);
    expect(where('destructiveHint')).toEqual(DESTRUCTIVE_TOOLS);
    expect(where('readOnlyHint')).toEqual(READ_ONLY_TOOLS);
  });

  it('never marks a read-only tool as sensitive or destructive', async () => {
    for (const t of await listTools()) {
      if (t.annotations?.readOnlyHint !== true) continue;
      expect(t.annotations?.sensitive, t.name).toBe(false);
      expect(t.annotations?.destructiveHint, t.name).toBe(false);
    }
  });
});
