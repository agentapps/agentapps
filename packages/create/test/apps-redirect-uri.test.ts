/**
 * No app of this repository treats the redirect URI as a secret (SETUP-REQ-1).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { redirectUriSecretProblem } from '../src/validate.js';

const APPS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps');

/** The apps that declared or read `REDIRECT_URI` before SETUP. */
const FORMER = [
  'dropbox',
  'google-ads',
  'google-analytics',
  'google-calendar',
  'google-docs',
  'google-drive',
  'google-forms',
  'google-gmail',
  'google-search-console',
  'google-sheets',
  'google-slides',
  'microsoft-excel',
  'microsoft-onedrive',
  'microsoft-onenote',
  'microsoft-outlook',
  'microsoft-word',
  'quickbooks',
  'salesforce',
  'slack',
  'youtube-analytics',
];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

describe('apps and the redirect URI', () => {
  const apps = readdirSync(APPS).filter((app) => existsSync(join(APPS, app, 'agentapp.json')));

  it('[SETUP-AC-1] no Manifest in apps/ declares REDIRECT_URI as a secret', () => {
    expect(apps.length).toBeGreaterThan(FORMER.length);
    for (const app of FORMER) expect(apps).toContain(app);
    const declaring = apps.filter((app) =>
      redirectUriSecretProblem(JSON.parse(readFileSync(join(APPS, app, 'agentapp.json'), 'utf8'))),
    );
    expect(declaring).toEqual([]);
  });

  it('[SETUP-AC-1] no app reads REDIRECT_URI, in its code, its tests or its README', () => {
    const mentioning = apps.filter((app) =>
      [
        ...sourceFiles(join(APPS, app, 'src')),
        ...sourceFiles(join(APPS, app, 'test')),
        join(APPS, app, 'README.md'),
      ].some((file) => existsSync(file) && readFileSync(file, 'utf8').includes('REDIRECT_URI')),
    );
    expect(mentioning).toEqual([]);
  });
});
