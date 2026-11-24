/**
 * Manifest and tool-surface checks for the Postiz Agent App.
 *
 * Keep the three lists below in sync with the tools in src/tools/.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeParseAppManifest } from '@agentapps/protocol';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { listTools } from './harness.js';

/** Every tool, sorted. */
const EXPECTED_TOOLS = [
  'create-draft',
  'delete-post',
  'find-next-slot',
  'get-channel-analytics',
  'get-post-analytics',
  'list-channels',
  'list-media',
  'list-notifications',
  'list-posts',
  'publish-post',
  'schedule-post',
  'upload-media-from-url',
];
/** Tools that pause for approval by default: the ones that change something outside the app's own data. */
const SENSITIVE_TOOLS: string[] = [
  'create-draft',
  'delete-post',
  'publish-post',
  'schedule-post',
  'upload-media-from-url',
];
/** Tools whose effect the app cannot undo (delete, overwrite, revoke, send). */
const DESTRUCTIVE_TOOLS: string[] = ['delete-post', 'publish-post', 'schedule-post'];

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(APP_DIR, 'agentapp.json'), 'utf-8'));

describe('Postiz: manifest', () => {
  it('passes the protocol schema', () => {
    const result = safeParseAppManifest(manifest);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    expect(manifest.id).toBe('app.postiz');
  });

  it('matches the createApp() config in src/app.ts', () => {
    const checkedIn = safeParseAppManifest(manifest);
    const generated = safeParseAppManifest(app.toManifest());
    expect(checkedIn.success && generated.success).toBe(true);
    if (!checkedIn.success || !generated.success) return;
    expect(generated.data).toEqual(checkedIn.data);
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
});

/** The annotation table of POSTIZ-REQ-10: readOnly, destructive, idempotent, openWorld, sensitive. */
const ANNOTATIONS: Record<string, [boolean, boolean, boolean, boolean, boolean]> = {
  'list-channels': [true, false, true, true, false],
  'find-next-slot': [true, false, true, true, false],
  'list-posts': [true, false, true, true, false],
  'get-channel-analytics': [true, false, true, true, false],
  'get-post-analytics': [true, false, true, true, false],
  'list-media': [true, false, true, true, false],
  'list-notifications': [true, false, true, true, false],
  'upload-media-from-url': [false, false, false, true, true],
  'create-draft': [false, false, false, true, true],
  'schedule-post': [false, true, false, true, true],
  'publish-post': [false, true, false, true, true],
  'delete-post': [false, true, true, true, true],
};

describe('Postiz: tools', () => {
  it('[POSTIZ-AC-9] registers the tools and annotations of the spec table', async () => {
    const tools = await listTools();
    const actual = Object.fromEntries(
      tools.map((t) => [
        t.name,
        [
          t.annotations?.readOnlyHint,
          t.annotations?.destructiveHint,
          t.annotations?.idempotentHint,
          t.annotations?.openWorldHint,
          t.annotations?.sensitive,
        ],
      ]),
    );
    expect(actual).toEqual(ANNOTATIONS);
  });

  it('lists exactly the expected tools', async () => {
    const tools = await listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS);
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

  it('marks as sensitive the tools with an effect outside the app, and only irreversible tools as destructive', async () => {
    const tools = await listTools();
    const where = (hint: string) =>
      tools
        .filter((t) => t.annotations?.[hint] === true)
        .map((t) => t.name)
        .sort();
    expect(where('sensitive')).toEqual(SENSITIVE_TOOLS);
    expect(where('destructiveHint')).toEqual(DESTRUCTIVE_TOOLS);
    for (const t of tools) {
      // A read-only tool changes nothing, so it never waits for approval.
      if (t.annotations?.readOnlyHint) expect(t.annotations?.sensitive, t.name).toBe(false);
    }
  });
});
