/**
 * Manifest and tool-surface checks for the LinkedIn Ads Agent App.
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
  'activate-campaign',
  'activate-campaign-group',
  'activate-creative',
  'get-ad-analytics',
  'get-campaign',
  'list-ad-accounts',
  'list-campaign-groups',
  'list-campaigns',
  'list-creatives',
  'pause-campaign',
  'pause-campaign-group',
  'pause-creative',
  'update-campaign-budget',
  'update-campaign-group-budget',
];
/** Tools that pause for approval by default: exactly the ones that are not read-only. */
const SENSITIVE_TOOLS = [
  'activate-campaign',
  'activate-campaign-group',
  'activate-creative',
  'pause-campaign',
  'pause-campaign-group',
  'pause-creative',
  'update-campaign-budget',
  'update-campaign-group-budget',
];
/**
 * Tools whose effect the app cannot undo. Here: everything that lets LinkedIn spend money
 * (activating, raising budgets), since spent money is not refunded. Pausing stops spend and
 * is undone by activating, so it is not destructive.
 */
const DESTRUCTIVE_TOOLS = [
  'activate-campaign',
  'activate-campaign-group',
  'activate-creative',
  'update-campaign-budget',
  'update-campaign-group-budget',
];

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(APP_DIR, 'agentapp.json'), 'utf-8'));

describe('LinkedIn Ads: manifest', () => {
  it('passes the protocol schema', () => {
    const result = safeParseAppManifest(manifest);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    expect(manifest.id).toBe('app.linkedin-ads');
  });

  it('declares LinkedIn OAuth with the three Advertising API scopes', () => {
    expect(manifest.auth).toMatchObject({
      type: 'oauth2',
      provider: 'linkedin',
      authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      scopes: ['r_ads', 'r_ads_reporting', 'rw_ads'],
    });
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

describe('LinkedIn Ads: tools', () => {
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

  it('marks exactly the writes as sensitive and only irreversible tools as destructive', async () => {
    const tools = await listTools();
    const where = (hint: string) =>
      tools
        .filter((t) => t.annotations?.[hint] === true)
        .map((t) => t.name)
        .sort();
    expect(where('sensitive')).toEqual(SENSITIVE_TOOLS);
    expect(where('destructiveHint')).toEqual(DESTRUCTIVE_TOOLS);
    for (const t of tools) {
      expect(t.annotations?.sensitive, t.name).toBe(!t.annotations?.readOnlyHint);
    }
  });
});
