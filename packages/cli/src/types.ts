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

/** Station-level settings from agentapps.json → "station". */
export interface StationConfig {
  /** Public base URL for OAuth callbacks (e.g. "https://your-station.example.com"). */
  publicUrl?: string;
  /** Default port for `agentapps serve`. */
  port?: number;
  /** Address the Station listens on; this machine only when not set (CLI-REQ-12). */
  host?: string;
}

/** Parsed agentapps.json workspace configuration, keyed by manifest id. */
export interface WorkspaceConfig {
  apps: Record<string, AppConfigEntry>;
  /** Station infrastructure settings. */
  station?: StationConfig;
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
}

export type { ResultValue } from './render/types.js';

/** Result returned by a command handler. */
export interface HandlerResult extends CommandResult {
  exitCode: number;
}
