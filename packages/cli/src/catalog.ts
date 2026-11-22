/**
 * @agentapps/cli — the catalog a CLI build carries (DIST-REQ-2): the apps it
 * can download without the repository, with enough metadata to list and
 * describe them before they are downloaded. Written by `scripts/build-catalog.mjs`
 * and embedded in the single executable.
 */

import { buildCatalog } from './build-info.js';

export interface CatalogEntry {
  id: string;
  /** npm package name, e.g. `@agentapps/app.hello`. */
  package: string;
  version: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  keywords: string[];
  author?: { name: string; email?: string };
  license?: string;
  /** How the app authenticates and the secrets it needs, as its manifest declares them. */
  auth?: { type: string; systemSecrets: string[]; installationSecrets: string[] };
}

let cached: CatalogEntry[] | undefined;

/** @spec DIST-REQ-2 */
export function loadCatalog(): CatalogEntry[] {
  cached ??= buildCatalog();
  return cached;
}

/** The catalog entry of an npm package, if the catalog has it. @spec DIST-REQ-2 */
export function catalogEntryForPackage(pkg: string): CatalogEntry | undefined {
  return loadCatalog().find((e) => e.package === pkg);
}
