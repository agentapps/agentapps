#!/usr/bin/env node
/**
 * Builds the release folder served at https://get.agentapps.tech (DIST-REQ-7):
 * the executables, `manifest.json` (version, time, and per platform the URL,
 * sha256 and size) and the installer `install.sh`.
 *
 *   node packages/cli/scripts/build-release.mjs          # this machine's platform
 *   node packages/cli/scripts/build-release.mjs --all    # every release platform
 *
 * Writes `packages/cli/dist-release/`. Nothing is published.
 *
 * @spec DIST-REQ-7
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'https://get.agentapps.tech';

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const binDir = join(cliDir, 'dist-bin');
const outDir = join(cliDir, 'dist-release');

rmSync(binDir, { recursive: true, force: true });
const built = spawnSync(
  process.execPath,
  [join(cliDir, 'scripts', 'build-executable.mjs'), ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
if (built.status !== 0) process.exit(built.status ?? 1);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const version = JSON.parse(readFileSync(join(cliDir, 'package.json'), 'utf8')).version;
const assets = {};
for (const file of readdirSync(binDir).sort()) {
  const platform = file.replace(/^agentapps-/, '');
  copyFileSync(join(binDir, file), join(outDir, file));
  const bytes = readFileSync(join(outDir, file));
  assets[platform] = {
    url: `${BASE_URL}/${file}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: statSync(join(outDir, file)).size,
  };
}

// One key per line: install.sh reads it with sed/awk.
const manifest = { version, publishedAt: new Date().toISOString(), assets };
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
copyFileSync(join(cliDir, 'release', 'install.sh'), join(outDir, 'install.sh'));
console.log(`release ${version}: ${Object.keys(assets).join(', ')} → ${outDir}`);
