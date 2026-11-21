#!/usr/bin/env node
/**
 * Packs every publishable app as a self-contained package (DIST-REQ-5) and,
 * with `--publish`, publishes each tarball to the npm registry (DIST-REQ-10).
 * A version the registry already has is left alone, so the release can be run
 * again after a failure.
 *
 *   node packages/cli/scripts/release-apps.mjs [--apps <dir>] [--out <dir>] [--publish]
 *
 * @spec DIST-REQ-10
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packApp } from './pack-app.mjs';
import { publishableApps } from './publishable-apps.mjs';

/** Pack every publishable app of `appsDir` into `outDir`. @spec DIST-REQ-10 */
export function packApps(appsDir, outDir) {
  return publishableApps(appsDir).map(({ dir, pkg }) => ({
    name: pkg.name,
    version: pkg.version,
    tarball: packApp(dir, outDir),
  }));
}

function isPublished(name, version) {
  const r = spawnSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === version;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const appsDir = resolve(value('--apps') ?? join(cliDir, '../../apps'));
  const outDir = resolve(value('--out') ?? join(cliDir, 'dist-apps'));
  try {
    const packed = packApps(appsDir, outDir);
    console.log(`packed ${packed.length} app(s) → ${outDir}`);
    if (args.includes('--publish')) {
      for (const { name, version, tarball } of packed) {
        if (isPublished(name, version)) {
          console.log(`already published: ${name}@${version}`);
          continue;
        }
        const r = spawnSync('npm', ['publish', tarball, '--access', 'public'], {
          stdio: 'inherit',
        });
        if (r.status !== 0) throw new Error(`npm publish failed for ${name}@${version}`);
        console.log(`published ${name}@${version}`);
      }
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
