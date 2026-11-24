/**
 * @agentapps/cli — subscribe / unsubscribe command.
 *
 * Launches a detached daemon that keeps a session open and listens for app
 * events. `unsubscribe` kills the daemon and removes its metadata.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isResult, stationOf } from '../station-client.js';
import { findInstallation, unknownAlias } from '../station-session.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import {
  getWatcher,
  listWatchers,
  removeWatcher,
  setWatcher,
  type WatcherRecord,
} from '../watchers.js';
import type { HandlerContext } from './types.js';

export async function handleSubscribe(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'subscribe') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected subscribe command' },
    };
  }

  const { alias, eventTypes, unsubscribe } = command;
  const { ctx } = context;

  // The watcher talks to the Station; so does the check that the alias exists.
  const station = stationOf(context);
  if (isResult(station)) return station;
  try {
    if (!(await findInstallation(station, alias))) return unknownAlias(alias);
  } catch (err) {
    return station.failure(err);
  }

  if (unsubscribe) {
    return stopWatcher(ctx.configPath, alias);
  }

  const existing = getWatcher(ctx.configPath, alias);
  if (existing && isProcessAlive(existing.pid)) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `${alias} is already being watched (PID ${existing.pid})`,
        suggestion: `Run "${alias} unsubscribe" to stop it.`,
      },
    };
  }

  // Clean up stale metadata if the process died.
  if (existing) {
    removeWatcher(ctx.configPath, alias);
  }

  const daemonPath = resolveDaemonPath();
  const child = spawn('node', [daemonPath, ctx.configPath, alias, ...eventTypes], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  child.unref();

  const record: WatcherRecord = {
    alias,
    pid: child.pid ?? 0,
    eventTypes,
    configPath: ctx.configPath,
    startedAt: new Date().toISOString(),
  };
  setWatcher(ctx.configPath, record);

  return {
    success: true,
    exitCode: 0,
    message: `Watching ${alias} for events: ${eventTypes.join(', ')} (PID ${record.pid})`,
  };
}

async function stopWatcher(configPath: string, alias: string): Promise<HandlerResult> {
  const watcher = getWatcher(configPath, alias);
  if (!watcher) {
    return {
      success: false,
      exitCode: 2,
      error: { message: `${alias} is not being watched` },
    };
  }

  try {
    process.kill(watcher.pid, 'SIGTERM');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      exitCode: 1,
      error: { message: `Failed to stop watcher for ${alias}: ${message}` },
    };
  }

  removeWatcher(configPath, alias);
  return { success: true, exitCode: 0, message: `Stopped watching ${alias}` };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Resolve the built daemon script path relative to this module. */
function resolveDaemonPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const distDir = dirname(currentFile);
  const daemonPath = resolve(distDir, '..', 'daemon.js');

  // When running from source under tsx, fall back to the TypeScript file.
  if (!existsSync(daemonPath)) {
    return resolve(distDir, '..', 'daemon.ts');
  }
  return daemonPath;
}

/** List active watchers for display commands. */
export function listActiveWatchers(
  configPath: string,
): { alias: string; pid: number; eventTypes: string[] }[] {
  return listWatchers(configPath)
    .filter((w) => isProcessAlive(w.pid))
    .map((w) => ({ alias: w.alias, pid: w.pid, eventTypes: w.eventTypes }));
}
