/**
 * @agentapps/cli — app resolution.
 *
 * Loads an app factory from a local source directory. Prefers built
 * `dist/app.js`, falls back to `src/app.ts` when run under a TypeScript
 * loader. Reads the exported `factory` (or default export).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ResolvedApp } from './types.js';

const MANIFEST_NAME = 'agentapp.json';

/** Resolve an app by id from its source directory. */
export async function resolveApp(appId: string, sourcePath: string): Promise<ResolvedApp> {
  const absoluteSource = resolve(sourcePath);

  if (!existsSync(absoluteSource)) {
    throw new Error(`App source not found: ${absoluteSource}`);
  }

  const manifest = readManifest(absoluteSource);
  const factory = await loadFactory(absoluteSource);

  return {
    name: appId,
    sourcePath: absoluteSource,
    factory,
    manifest,
  };
}

/** Read agentapp.json if present. */
function readManifest(sourcePath: string): Record<string, unknown> | undefined {
  const manifestPath = join(sourcePath, MANIFEST_NAME);
  if (!existsSync(manifestPath)) return undefined;
  try {
    const raw = readFileSync(manifestPath, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Load the factory from the source directory. */
async function loadFactory(
  sourcePath: string,
): Promise<(transport: import('@agentapps/protocol').Transport) => void | Promise<void>> {
  const distPath = join(sourcePath, 'dist', 'app.js');
  const srcPath = join(sourcePath, 'src', 'app.ts');

  // Prefer built dist/app.js when it exists.
  if (existsSync(distPath)) {
    return importFactory(distPath);
  }

  // Fall back to src/app.ts when running under a TypeScript loader.
  if (existsSync(srcPath)) {
    return importFactory(srcPath);
  }

  throw new Error(
    `Could not find app entry in ${sourcePath} (looked for dist/app.js and src/app.ts)`,
  );
}

/** Dynamic import that resolves the factory export. */
async function importFactory(
  modulePath: string,
): Promise<(transport: import('@agentapps/protocol').Transport) => void | Promise<void>> {
  // Convert to file URL for cross-platform compatibility.
  const url = new URL(`file://${modulePath}`).href;
  const mod = (await importModule(modulePath, url)) as Record<string, unknown>;

  const factory = mod.factory ?? mod.default;
  if (typeof factory !== 'function') {
    throw new Error(`Module ${modulePath} does not export a factory function`);
  }

  return factory as (transport: import('@agentapps/protocol').Transport) => void | Promise<void>;
}

/**
 * Registers the tsx ESM loader exactly once per process.
 *
 * We deliberately use tsx's persistent `register()` rather than its per-call
 * `tsImport()`: `tsImport` installs an ephemeral loader scope for each call and
 * is NOT safe under concurrency — overlapping calls corrupt the loader state so
 * some `.ts` modules get handed to Node's native ESM parser un-transformed,
 * surfacing as `SyntaxError: Unexpected identifier 'as'`. That bit callers that
 * resolve several apps at once (e.g. `handleList`'s `Promise.all`). `register()`
 * installs a single global hook that handles concurrent imports correctly.
 *
 * The registration is memoized on a promise so concurrent first-callers share
 * one `register()` and never stack multiple loaders. If tsx cannot be loaded we
 * swallow the error and fall back to Node's native dynamic import.
 */
let tsxSetup: Promise<void> | undefined;

function ensureTsxRegistered(): Promise<void> {
  if (!tsxSetup) {
    tsxSetup = import('tsx/esm/api')
      .then(({ register }) => {
        register();
      })
      .catch(() => {
        // tsx unavailable — native import is the fallback.
      });
  }
  return tsxSetup;
}

/**
 * Import a module, using the tsx loader for TypeScript sources.
 *
 * Node's native type stripping loads a `.ts` entry but does NOT rewrite nested
 * `./x.js` import specifiers to `.ts`, so a multi-file TS app run from source
 * fails to resolve its own imports. tsx handles that rewriting, matching how
 * apps declare `runtime.command: tsx`. For built `.js` (and as a fallback when
 * tsx is unavailable) we use the native dynamic import.
 */
async function importModule(modulePath: string, url: string): Promise<unknown> {
  if (modulePath.endsWith('.ts')) {
    // Ensure tsx's persistent loader is active before importing a TS source.
    // Once registered, its transform (including nested `./x.js` → `.ts`
    // rewriting) applies to the plain dynamic import below.
    await ensureTsxRegistered();
  }
  return import(url);
}
