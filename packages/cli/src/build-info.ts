/**
 * @agentapps/cli — what a build knows about itself: its version, its catalog,
 * and whether it runs as the single executable (DIST-REQ-4). The executable
 * build injects `AGENTAPPS_BUILD` (see `scripts/build-executable.mjs`); a
 * Node build reads the same facts from the package files.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CatalogEntry } from './catalog.js';

interface EmbeddedBuild {
  version: string;
  catalog: { apps: CatalogEntry[] };
}

declare const AGENTAPPS_BUILD: string | undefined;

const embedded: EmbeddedBuild | undefined =
  typeof AGENTAPPS_BUILD === 'string' ? (JSON.parse(AGENTAPPS_BUILD) as EmbeddedBuild) : undefined;

/** True inside the single executable. @spec DIST-REQ-4 */
export const isExecutable = embedded !== undefined;

/** The version of this build. @spec DIST-REQ-4 */
export function buildVersion(): string {
  if (embedded) return embedded.version;
  const pkg = fileURLToPath(new URL('../package.json', import.meta.url));
  return (JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version;
}

/** The catalog this build carries. @spec DIST-REQ-2 */
export function buildCatalog(): CatalogEntry[] {
  if (embedded) return embedded.catalog.apps;
  // `dist/catalog.json`, the same file from `src/` (tests) and `dist/` (the CLI).
  const path = fileURLToPath(new URL('../dist/catalog.json', import.meta.url));
  if (!existsSync(path)) return [];
  try {
    return (JSON.parse(readFileSync(path, 'utf8')) as { apps?: CatalogEntry[] }).apps ?? [];
  } catch {
    return [];
  }
}
