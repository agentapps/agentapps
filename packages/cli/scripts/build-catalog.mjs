#!/usr/bin/env node
/**
 * Writes `packages/cli/dist/catalog.json`: the apps a CLI build can download
 * without the repository (DIST-REQ-2): the publishable apps (DIST-REQ-10).
 *
 * @spec DIST-REQ-2
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishableApps } from './publishable-apps.mjs';

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appsDir = resolve(cliDir, '../../apps');
const out = join(cliDir, 'dist', 'catalog.json');

const apps = publishableApps(appsDir).map(({ pkg, manifest }) => ({
  id: manifest.id,
  package: pkg.name,
  version: pkg.version,
  name: manifest.name ?? manifest.id,
  tagline: manifest.tagline ?? '',
  description: manifest.description ?? '',
  category: manifest.category ?? '',
  keywords: Array.isArray(manifest.keywords) ? manifest.keywords : [],
  ...(manifest.author ? { author: manifest.author } : {}),
  ...(manifest.license ? { license: manifest.license } : {}),
  auth: {
    type: manifest.auth?.type ?? 'none',
    systemSecrets: manifest.auth?.systemSecrets ?? [],
    installationSecrets: manifest.auth?.installationSecrets ?? [],
  },
}));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ apps }, null, 2)}\n`);
console.log(`catalog: ${apps.length} app(s) → ${out}`);
