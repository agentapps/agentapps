/**
 * @agentapps/cli — internal types.
 *
 * Workspace configuration, parsed command shape, and app resolution helpers.
 */

import type { CommandResult } from './render/types.js';

export type { ReplCommand } from './repl-parser.js';

/**
 * A single app entry, keyed in memory by the app's manifest `id`.
 *
 * `agentapps.json` only declares `source` paths; there is no catalog id. The
 * loader reads each source's `agentapp.json` and indexes entries by the
 * manifest `id`, so the id is always the canonical manifest id.
 */
export interface AppConfigEntry {
  /** Local path to the app project directory (as written in agentapps.json). */
  source: string;
  /** Display name from the app manifest (best-effort). */
  name?: string;
}

/** Settings of the Station this workspace starts, from agentapps.json → "station". */
export interface StationConfig {
  /** Stable identifier of the Station, written when the CLI creates the config (SETUP-REQ-12). */
  id?: string;
  /**
   * Public base URL of the Station (e.g. "https://your-station.example.com").
   * A Station does not start without one (SETUP-REQ-11).
   */
  publicUrl?: string;
  /** Default port for `agentapps serve`. */
  port?: number;
  /** Address the Station listens on; this machine only when not set (CLI-REQ-12). */
  host?: string;
}

/** The CLI's own settings, from agentapps.json → "cli". */
export interface CliConfig {
  /** The Station the CLI connects to (SETUP-REQ-6). Distinct from the `station` block. */
  stationUrl?: string;
}

/** Parsed agentapps.json workspace configuration, keyed by manifest id. */
export interface WorkspaceConfig {
  apps: Record<string, AppConfigEntry>;
  /** Settings of the Station this workspace starts. */
  station?: StationConfig;
  /** The CLI's own settings. */
  cli?: CliConfig;
  /** The Workspace this config is of; its id is the same on every Station it uses. */
  workspace?: { id?: string };
  /** `npm:` sources referenced but not yet installed (recover with `sync`). */
  missing?: string[];
}

/** Source resolution result for an app. */
export interface ResolvedApp {
  name: string;
  sourcePath: string;
  factory: (transport: import('@agentapps/protocol').Transport) => void | Promise<void>;
  manifest?: Record<string, unknown>;
}

/** CLI runtime context. */
export interface CliContext {
  cwd: string;
  config: WorkspaceConfig;
  configPath: string;
}

/** Global CLI options shared by REPL and one-shot mode. */
export interface GlobalOptions {
  config?: string;
  cwd?: string;
  json: boolean;
  yaml: boolean;
  raw: boolean;
  manualCode: boolean;
  /** Print OAuth URL without starting a callback server or waiting. */
  urlOnly: boolean;
  yes: boolean;
  verbose: boolean;
  help: boolean;
  /**
   * Internal: run `serve` in the foreground (blocking). Public `serve` always
   * detaches by spawning a worker with this flag set. Not shown in help.
   */
  foreground?: boolean;
  /** `--public-url`: the public URL of the Station being started (SETUP-REQ-11). */
  publicUrl?: string;
}

export type { ResultValue } from './render/types.js';

/** Result returned by a command handler. */
export interface HandlerResult extends CommandResult {
  exitCode: number;
}
