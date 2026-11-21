/**
 * The apps of an apps directory that are published to npm (DIST-REQ-10): every
 * folder with a `package.json` and an `agentapp.json`, unless its package.json
 * says `"agentapps": { "publish": false }`. The package of a publishable app is
 * named `@agentapps/<appId>`.
 *
 * @spec DIST-REQ-10
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** @spec DIST-REQ-10 */
export function publishableApps(appsDir) {
  const apps = [];
  for (const name of readdirSync(appsDir).sort()) {
    const dir = join(appsDir, name);
    const pkgPath = join(dir, 'package.json');
    const manifestPath = join(dir, 'agentapp.json');
    if (!existsSync(pkgPath) || !existsSync(manifestPath)) continue;
    const pkg = readJson(pkgPath);
    if (pkg.agentapps?.publish === false) continue;
    const manifest = readJson(manifestPath);
    if (pkg.name !== `@agentapps/${manifest.id}`) {
      throw new Error(
        `${dir}: the package must be named @agentapps/${manifest.id}, not ${pkg.name}`,
      );
    }
    apps.push({ dir, pkg, manifest });
  }
  return apps;
}
