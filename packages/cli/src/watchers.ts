/**
 * @agentapps/cli — background watcher bookkeeping.
 *
 * Tracks detached daemon processes launched by the `subscribe` command so
 * they can be listed and killed later.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stateDir } from './state.js';

const WATCHERS_DIR = 'watchers';

export interface WatcherRecord {
  alias: string;
  pid: number;
  eventTypes: string[];
  configPath: string;
  startedAt: string;
}

/** Resolve the directory that stores watcher metadata. */
export function watchersDir(configPath: string): string {
  return resolve(stateDir(configPath), WATCHERS_DIR);
}

/** Ensure the watchers directory exists. */
export function ensureWatchersDir(configPath: string): string {
  const dir = watchersDir(configPath);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Path to the metadata file for a single watcher. */
export function watcherPath(configPath: string, alias: string): string {
  return resolve(watchersDir(configPath), `${alias}.json`);
}

/** Load a watcher record by alias. */
export function getWatcher(configPath: string, alias: string): WatcherRecord | undefined {
  const path = watcherPath(configPath, alias);
  if (!existsSync(path)) return undefined;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isWatcherRecord(parsed)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/** Save watcher metadata. */
export function setWatcher(configPath: string, record: WatcherRecord): void {
  ensureWatchersDir(configPath);
  writeFileSync(
    watcherPath(configPath, record.alias),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8',
  );
}

/** Remove watcher metadata. */
export function removeWatcher(configPath: string, alias: string): void {
  const path = watcherPath(configPath, alias);
  if (existsSync(path)) {
    rmSync(path);
  }
}

/** List all recorded watchers. */
export function listWatchers(configPath: string): WatcherRecord[] {
  const dir = watchersDir(configPath);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => getWatcher(configPath, f.slice(0, -5)))
    .filter((w): w is WatcherRecord => w !== undefined);
}

function isWatcherRecord(value: unknown): value is WatcherRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).alias === 'string' &&
    typeof (value as Record<string, unknown>).pid === 'number' &&
    Array.isArray((value as Record<string, unknown>).eventTypes) &&
    typeof (value as Record<string, unknown>).configPath === 'string' &&
    typeof (value as Record<string, unknown>).startedAt === 'string'
  );
}
