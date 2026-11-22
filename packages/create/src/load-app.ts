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

// The loader of the last fresh load. Each fresh load gets its own namespace, which is what
// makes tsx import the entry module and every module it imports again; the previous one is
// unregistered first, so loaders do not pile up over a long dev session.
let fresh: NamespacedUnregister | undefined;
let freshCount = 0;

/**
 * Imports a module by path. With `cacheBust`, the module and everything it imports are
 * loaded again from disk (dev reloads).
 *
 * @spec DEVX-REQ-1
 */
export async function importAppModule(
  path: string,
  cacheBust = false,
): Promise<Record<string, unknown>> {
  if (!cacheBust) {
    tsx ??= register({ namespace: 'agentapps-create' });
    return tsx.import(pathToFileURL(path).href, import.meta.url);
  }
  await fresh?.unregister();
  fresh = register({ namespace: `agentapps-create-reload-${process.pid}-${++freshCount}` });
  return fresh.import(pathToFileURL(path).href, import.meta.url);
}

export async function loadFactory(cwd: string, cacheBust = false): Promise<AppFactory> {
  const mod = await importAppModule(join(cwd, 'src', 'app.ts'), cacheBust);
  return (mod.factory ?? mod.default ?? mod) as AppFactory;
}
