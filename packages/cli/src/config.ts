/**
 * @agentapps/cli — workspace configuration loader.
 *
 * Reads `agentapps.json` from the current working directory, searching
 * upward through parent directories. Falls back to a global config at
 * `~/.agentapps/config.json` so the CLI works from any directory.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogEntryForPackage, loadCatalog } from './catalog.js';
import { LOCAL_STATION_HOST, LOCAL_STATION_PORT, LOCAL_STATION_URL } from './station-url.js';
import type { AppConfigEntry, CliConfig, StationConfig, WorkspaceConfig } from './types.js';

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
 * Remember the workspace a run used, so later runs from other directories find
 * it. A workspace given with `--config` is a one-off and is not remembered.
 *
 * @spec CLI-REQ-4
 */
export function rememberWorkspace(configPath: string, viaConfigFlag: boolean): void {
  if (viaConfigFlag) return;
  saveGlobalWorkspace(dirname(resolve(configPath)));
}

/** The workspace used outside any clone or saved workspace (DIST-REQ-1). */
const HOME_WORKSPACE = join(GLOBAL_DIR, 'workspace');

/** A new random identifier: a prefix and 128 random bits in hexadecimal. */
function newId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString('hex')}`;
}

/**
 * The settings a workspace config is created with: the Station this
 * workspace starts, the Station the CLI connects to, and the Workspace's id.
 *
 * @spec SETUP-REQ-12
 */
export function newWorkspaceSettings(): {
  station: Required<StationConfig>;
  cli: Required<CliConfig>;
  workspace: { id: string };
} {
  return {
    station: {
      id: newId('stn'),
      host: LOCAL_STATION_HOST,
      port: LOCAL_STATION_PORT,
      publicUrl: LOCAL_STATION_URL,
    },
    cli: { stationUrl: LOCAL_STATION_URL },
    workspace: { id: newId('ws') },
  };
}

/**
 * The home workspace's `agentapps.json`, created on first use with the
 * catalog's apps as `npm:` sources and the settings of SETUP-REQ-12.
 *
 * @spec DIST-REQ-1
 * @spec SETUP-REQ-12
 */
export function ensureHomeWorkspace(): string {
  const configPath = join(HOME_WORKSPACE, CONFIG_NAME);
  if (!existsSync(configPath)) {
    mkdirSync(HOME_WORKSPACE, { recursive: true });
    const apps = loadCatalog().map((e) => ({ source: `npm:${e.package}@${e.version}` }));
    writeFileSync(
      configPath,
      `${JSON.stringify({ ...newWorkspaceSettings(), apps }, null, 2)}\n`,
      'utf8',
    );
  }
  return configPath;
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
      if (!e.source.startsWith('npm:')) throw err;
    }
    if (!manifest && e.source.startsWith('npm:')) {
      // DIST-REQ-2: an app the catalog knows is available before it is downloaded.
      const known = catalogEntryForPackage(npmPackageName(e.source.slice('npm:'.length)));
      if (!known) {
        missing.push(e.source);
        return;
      }
      manifest = { id: known.id, name: known.name };
    }
    if (!manifest) {
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
      ...(typeof c.id === 'string' ? { id: c.id } : {}),
      ...(typeof c.publicUrl === 'string' ? { publicUrl: c.publicUrl } : {}),
      ...(typeof c.port === 'number' ? { port: c.port } : {}),
      ...(typeof c.host === 'string' ? { host: c.host } : {}),
    };
  }

  // The CLI's own settings: where its Station is (SETUP-REQ-6).
  let cli: CliConfig | undefined;
  const rawCli = parsed.cli;
  if (rawCli && typeof rawCli === 'object' && !Array.isArray(rawCli)) {
    const c = rawCli as Record<string, unknown>;
    cli = { ...(typeof c.stationUrl === 'string' ? { stationUrl: c.stationUrl } : {}) };
  }

  // The Workspace's id, decided when the config was created (STADMIN-REQ-11).
  const rawWorkspace = parsed.workspace;
  const workspaceId =
    rawWorkspace && typeof rawWorkspace === 'object' && !Array.isArray(rawWorkspace)
      ? (rawWorkspace as Record<string, unknown>).id
      : undefined;

  return {
    apps,
    station,
    ...(cli ? { cli } : {}),
    ...(typeof workspaceId === 'string' ? { workspace: { id: workspaceId } } : {}),
    ...(missing.length > 0 ? { missing } : {}),
  };
}

/**
 * What `apps` and `info` show for a source: its manifest once downloaded,
 * otherwise its catalog entry (DIST-REQ-2).
 *
 * @spec DIST-REQ-2
 */
export function sourceMetadata(
  configPath: string,
  source: string,
): Record<string, unknown> | undefined {
  try {
    const manifest = readSourceManifest(resolveSourcePath(configPath, source));
    if (manifest) return manifest;
  } catch {
    // Not downloaded yet: fall back to the catalog.
  }
  if (!source.startsWith('npm:')) return undefined;
  const entry = catalogEntryForPackage(npmPackageName(source.slice('npm:'.length)));
  return entry ? { ...entry } : undefined;
}

/**
 * Add a source to the workspace's `agentapps.json`, unless it is already listed.
 *
 * @spec STADMIN-REQ-9
 */
export function addAppSource(configPath: string, source: string): void {
  const raw = JSON.parse(readFileSync(configPath, 'utf8')) as { apps?: { source?: string }[] };
  const apps = Array.isArray(raw.apps) ? raw.apps : [];
  if (apps.some((a) => a?.source === source)) return;
  raw.apps = [...apps, { source }];
  writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
}

/** Remove a source from the workspace's `agentapps.json`. Answers whether it was listed. */
export function removeAppSource(configPath: string, source: string): boolean {
  const raw = JSON.parse(readFileSync(configPath, 'utf8')) as { apps?: { source?: string }[] };
  const apps = Array.isArray(raw.apps) ? raw.apps : [];
  const kept = apps.filter((a) => a?.source !== source);
  if (kept.length === apps.length) return false;
  raw.apps = kept;
  writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  return true;
}

/**
 * Write the Station the CLI connects to, `cli.stationUrl`, leaving everything
 * else in the workspace config as it is.
 *
 * @spec CLIENT-REQ-9
 */
export function setCliStationUrl(configPath: string, stationUrl: string): void {
  const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  const cli =
    raw.cli && typeof raw.cli === 'object' && !Array.isArray(raw.cli)
      ? (raw.cli as Record<string, unknown>)
      : {};
  raw.cli = { ...cli, stationUrl };
  writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
}

/** Whether an `npm:` source still has to be downloaded. @spec DIST-REQ-3 */
export function needsDownload(configPath: string, source: string): boolean {
  if (!source.startsWith('npm:')) return false;
  try {
    resolveSourcePath(configPath, source);
    return false;
  } catch {
    return true;
  }
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
    // The CLI-managed app store first, by path: Bun's resolver (the single
    // executable, DIST-REQ-4) does not resolve packages on disk this way.
    const stored = join(configDir, '.agentapps', 'apps', 'node_modules', ...pkg.split('/'));
    if (existsSync(join(stored, 'package.json'))) return stored;
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
