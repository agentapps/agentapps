#!/usr/bin/env node
/**
 * Builds the single `agentapps` executable (DIST-REQ-4) with `bun build --compile`,
 * embedding this build's version and catalog.
 *
 *   node packages/cli/scripts/build-executable.mjs          # this machine's platform
 *   node packages/cli/scripts/build-executable.mjs --all    # every release platform
 *
 * Writes `packages/cli/dist-bin/agentapps-<os>-<arch>`.
 *
 * @spec DIST-REQ-4
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLATFORMS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'];

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(cliDir, 'dist-bin');

function hostPlatform() {
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : process.arch;
  return `${process.platform}-${arch}`;
}

function run(command, args) {
  const r = spawnSync(command, args, { cwd: cliDir, stdio: 'inherit' });
  if (r.error) throw new Error(`${command}: ${r.error.message}`);
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const platforms = process.argv.includes('--all') ? PLATFORMS : [hostPlatform()];
for (const p of platforms) {
  if (!PLATFORMS.includes(p)) throw new Error(`Unsupported platform: ${p}`);
}

run(process.execPath, [join(cliDir, 'scripts', 'build-catalog.mjs')]);
const build = {
  version: JSON.parse(readFileSync(join(cliDir, 'package.json'), 'utf8')).version,
  catalog: JSON.parse(readFileSync(join(cliDir, 'dist', 'catalog.json'), 'utf8')),
};

mkdirSync(outDir, { recursive: true });
for (const platform of platforms) {
  const outfile = join(outDir, `agentapps-${platform}`);
  run('bun', [
    'build',
    '--compile',
    `--target=bun-${platform}`,
    // A JSON string literal; build-info.ts parses it.
    '--define',
    `AGENTAPPS_BUILD=${JSON.stringify(JSON.stringify(build))}`,
    join(cliDir, 'src', 'bin.ts'),
    '--outfile',
    outfile,
  ]);
  console.log(`executable: ${outfile}`);
}
