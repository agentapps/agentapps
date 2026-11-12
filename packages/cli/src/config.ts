/**
 * @agentapps/cli — workspace configuration loader.
 *
 * Reads `agentapps.json` from the current working directory, searching
 * upward through parent directories. Falls back to a global config at
 * `~/.agentapps/config.json` so the CLI works from any directory.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfigEntry, StationConfig, WorkspaceConfig } from './types.js';

const CONFIG_NAME = 'agentapps.json';
/**
 * Tracked, sanitized template config (app allowlist + neutral station). Used as
 * a fallback when no `agentapps.json` exists, so the repo can ship a working
 * default without committing any deployment-specific URLs.
 */
const EXAMPLE_CONFIG_NAME = 'agentapps.example.json';
/**
 * Optional, gitignored per-machine overrides deep-merged over `agentapps.json`.
 * Lets contributors point the station at a local URL, add scratch apps, etc.
 * without dirtying the tracked config. Local values win; objects merge
 * recursively, while arrays and scalars are replaced wholesale.
 */
const LOCAL_CONFIG_NAME = 'agentapps.local.json';
const MANIFEST_NAME = 'agentapp.json';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merge `override` onto `base` (arrays and scalars replace, objects merge). */
function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return out;
}

/**
 * Read `agentapps.json`, deep-merging an optional sibling `agentapps.local.json`
 * on top. This is the single source of raw config for both {@link loadWorkspaceConfig}
 * and the `sync` command, so local overrides apply everywhere consistently.
 */
export function readRawConfig(configPath: string): Record<string, unknown> {
  const base = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  const localPath = join(dirname(resolve(configPath)), LOCAL_CONFIG_NAME);
  if (!existsSync(localPath)) return base;
  let local: Record<string, unknown>;
  try {
    local = JSON.parse(readFileSync(localPath, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Invalid ${LOCAL_CONFIG_NAME}: ${(err as Error).message}`);
  }
  return deepMerge(base, local);
}

/** Global user config directory and file. */
const GLOBAL_DIR = join(homedir(), '.agentapps');
const GLOBAL_CONFIG = join(GLOBAL_DIR, 'config.json');

interface GlobalConfig {
  workspace?: string;
}

/**
 * Find the nearest agentapps.json.
 *
 * 1. Walk up from `cwd` looking for agentapps.json (local workspace).
 * 2. Fall back to `~/.agentapps/config.json` → `workspace` path (global).
 */
export function findConfigPath(cwd: string): string | null {
  // 1. Local: walk up from cwd. Prefer the developer's own (gitignored)
  //    `agentapps.json`; fall back to the tracked `agentapps.example.json` so a
  //    fresh clone works out of the box without exposing any deployment URLs.
  let current = resolve(cwd);
  while (true) {
    const own = join(current, CONFIG_NAME);
    if (existsSync(own)) return own;
    const example = join(current, EXAMPLE_CONFIG_NAME);
    if (existsSync(example)) return example;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 2. Global fallback: ~/.agentapps/config.json → workspace.
  const global = readGlobalConfig();
  if (global?.workspace) {
    const own = join(resolve(global.workspace), CONFIG_NAME);
    if (existsSync(own)) return own;
    const example = join(resolve(global.workspace), EXAMPLE_CONFIG_NAME);
    if (existsSync(example)) return example;
  }

  return null;
}

/** Read the global config, returning null if absent or invalid. */
function readGlobalConfig(): GlobalConfig | null {
  if (!existsSync(GLOBAL_CONFIG)) return null;
  try {
    return JSON.parse(readFileSync(GLOBAL_CONFIG, 'utf8')) as GlobalConfig;
  } catch {
    return null;
  }
}

/**
 * Persist the workspace path to `~/.agentapps/config.json`.
 *
 * Called by `install.sh` (via `agentapps --set-workspace <path>`) or
 * automatically the first time the CLI finds a local agentapps.json.
 */
export function saveGlobalWorkspace(workspacePath: string): void {
  const current = readGlobalConfig() ?? {};
  current.workspace = resolve(workspacePath);
  mkdirSync(GLOBAL_DIR, { recursive: true });
  writeFileSync(GLOBAL_CONFIG, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
}

/**
 * Ensure `~/.agentapps/config.json` exists, creating a template if needed.
 * Returns the absolute path to the file.
 */
export function ensureGlobalConfig(): string {
  if (!existsSync(GLOBAL_CONFIG)) {
    mkdirSync(GLOBAL_DIR, { recursive: true });
    writeFileSync(GLOBAL_CONFIG, `${JSON.stringify({ workspace: '' }, null, 2)}\n`, 'utf8');
  }
  return GLOBAL_CONFIG;
}

/**
 * Load and validate the workspace configuration.
 *
 * `agentapps.json` declares only an array of `{ source }` entries — there is no
 * catalog id. Each source's `agentapp.json` is read to obtain the canonical
 * manifest `id`, and entries are indexed by that id. This guarantees that the
 * id used everywhere (install, config, secrets, app station) is always the
 * manifest id, eliminating any chance of a catalog/manifest id mismatch.
 */
export function loadWorkspaceConfig(configPath: string): WorkspaceConfig {
  const parsed = readRawConfig(configPath);

  if (!Array.isArray(parsed.apps)) {
    throw new Error(`Invalid ${CONFIG_NAME}: "apps" must be an array of { "source" } entries`);
  }

  const apps: Record<string, AppConfigEntry> = {};
  const missing: string[] = [];
  parsed.apps.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Invalid ${CONFIG_NAME}: apps[${index}] must be an object`);
    }
    const e = entry as Record<string, unknown>;
    if (!e.source || typeof e.source !== 'string') {
      throw new Error(`Invalid ${CONFIG_NAME}: apps[${index}] missing "source" string`);
    }

    // An `npm:` source that is not installed yet is not fatal — record it as
    // missing (recoverable with `agentapps sync`) and skip it, so the CLI still
    // boots. Path sources, and installed npm sources with a bad manifest, still
    // hard-fail to catch real mistakes.
    let manifest: Record<string, unknown> | undefined;
    try {
      manifest = readSourceManifest(resolveSourcePath(configPath, e.source));
    } catch (err) {
      if (e.source.startsWith('npm:')) {
        missing.push(e.source);
        return;
      }
      throw err;
    }
    if (!manifest) {
      if (e.source.startsWith('npm:')) {
        missing.push(e.source);
        return;
      }
      throw new Error(
        `Invalid ${CONFIG_NAME}: source "${e.source}" has no readable ${MANIFEST_NAME}. ` +
          `Build the app first so its manifest (with the canonical "id") exists.`,
      );
    }
    const id = manifest.id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error(
        `Invalid ${CONFIG_NAME}: ${MANIFEST_NAME} at "${e.source}" is missing a string "id"`,
      );
    }
    if (apps[id]) {
      throw new Error(
        `Invalid ${CONFIG_NAME}: duplicate app id "${id}" ` +
          `(sources "${apps[id].source}" and "${e.source}")`,
      );
    }

    apps[id] = {
      source: e.source,
      ...(typeof manifest.name === 'string' ? { name: manifest.name } : {}),
    };
  });

  // Parse optional station section
  let station: StationConfig | undefined;
  const rawStation = parsed.station;
  if (rawStation && typeof rawStation === 'object' && !Array.isArray(rawStation)) {
    const c = rawStation as Record<string, unknown>;
    station = {
      ...(typeof c.publicUrl === 'string' ? { publicUrl: c.publicUrl } : {}),
      ...(typeof c.port === 'number' ? { port: c.port } : {}),
    };
  }

  return { apps, station, ...(missing.length > 0 ? { missing } : {}) };
}

/**
 * Read a source directory's `agentapp.json`, if present and valid JSON.
 *
 * @spec CLI-REQ-1
 */
export function readSourceManifest(sourcePath: string): Record<string, unknown> | undefined {
  const manifestPath = join(sourcePath, MANIFEST_NAME);
  if (!existsSync(manifestPath)) return undefined;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Resolve an app source to a directory on disk.
 *
 * - `npm:<pkg>` — an installed npm package (e.g. `npm:@agentapps/app.hello`).
 *   Resolved via Node module resolution from the workspace, then the global
 *   `~/.agentapps` app store, so extracted apps can be `npm install`ed rather
 *   than living in the workspace tree.
 * - anything else — a path relative to the directory containing the config.
 */
export function resolveSourcePath(configPath: string, source: string): string {
  const configDir = dirname(resolve(configPath));

  if (source.startsWith('npm:')) {
    const pkg = npmPackageName(source.slice('npm:'.length));
    // Search: the CLI-managed app store first (where `sync` installs), then the
    // workspace, then the global store.
    const roots = [
      join(configDir, '.agentapps', 'apps'),
      configDir,
      join(GLOBAL_DIR, 'apps'),
      GLOBAL_DIR,
    ];
    for (const from of roots) {
      try {
        const req = createRequire(resolve(from, '_resolver.cjs'));
        return dirname(req.resolve(`${pkg}/package.json`));
      } catch {
        // Try the next resolution root.
      }
    }
    throw new Error(
      `App package not found: ${pkg}. Run "agentapps sync" to install apps referenced in agentapps.json.`,
    );
  }

  return resolve(configDir, source);
}

/** Package name from an npm source spec, dropping an optional `@version`. */
export function npmPackageName(spec: string): string {
  const at = spec.lastIndexOf('@');
  // at > 0 means a version tag (`@scope/name@1.2.3` / `name@1.2.3`); at === 0 is
  // just the scope marker.
  return at > 0 ? spec.slice(0, at) : spec;
}

/** Default cwd when running as a CLI (file:// URL or process.cwd()). */
export function getDefaultCwd(): string {
  if (typeof process !== 'undefined' && process.cwd) {
    return process.cwd();
  }
  return dirname(fileURLToPath(import.meta.url));
}
