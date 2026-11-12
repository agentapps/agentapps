/**
 * Loads an app's entry module through tsx, so the TypeScript source runs on every
 * supported Node version (no build step, no native type stripping needed).
 */

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AppFactory } from '@agentapps/sdk';
import { type NamespacedUnregister, register } from 'tsx/esm/api';

// One registration per process. tsImport() registers a new loader on every call and Node
// never drops one, so each load ran through every earlier hook: on Node 20 and 22 the fifth
// or sixth app with a relative import took minutes, blocking the event loop (and every
// timeout) while it resolved.
let tsx: NamespacedUnregister | undefined;

/** Imports a module by path; `cacheBust` forces a fresh copy of it (dev reloads). */
export async function importAppModule(
  path: string,
  cacheBust = false,
): Promise<Record<string, unknown>> {
  tsx ??= register({ namespace: 'agentapps-create' });
  const specifier = `${pathToFileURL(path).href}${cacheBust ? `?${Date.now()}` : ''}`;
  return tsx.import(specifier, import.meta.url);
}

export async function loadFactory(cwd: string, cacheBust = false): Promise<AppFactory> {
  const mod = await importAppModule(join(cwd, 'src', 'app.ts'), cacheBust);
  return (mod.factory ?? mod.default ?? mod) as AppFactory;
}
