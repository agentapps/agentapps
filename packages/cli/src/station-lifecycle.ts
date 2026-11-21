/**
 * @agentapps/cli — station lifecycle.
 *
 * Shared helpers for running the station as a detached background process:
 * probing a port, spawning the worker, tracking it in `.agentapps/station.json`,
 * checking its health, and stopping it. Used by both `serve` and `station`.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { get as httpGet } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isExecutable } from './build-info.js';
import { stateDir } from './state.js';
import type { HandlerResult } from './types.js';

/** Persisted metadata for the detached station we launched. */
export interface StationMeta {
  pid: number;
  port: number;
  url: string;
  startedAt: string;
  logPath: string;
  /** Local admin credential for this station, so the CLI can answer approvals (POLICY-REQ-7). */
  adminToken?: string;
}

/** Whether a port is free, already serving a station, or held by something else. */
export type PortState = 'free' | 'station' | 'busy';

/** Path to the built CLI entry, so the detached worker re-invokes this binary. */
function resolveBinPath(): string {
  // dist/station-lifecycle.js → dist/bin.js
  return resolve(dirname(fileURLToPath(import.meta.url)), 'bin.js');
}

export function stationMetaPath(configPath: string): string {
  return resolve(stateDir(configPath), 'station.json');
}

export function stationLogPath(configPath: string): string {
  return resolve(stateDir(configPath), 'station.log');
}

/** Read the tracked station metadata, or undefined if none/unreadable. */
export function readStationMeta(configPath: string): StationMeta | undefined {
  const path = stationMetaPath(configPath);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as StationMeta;
  } catch {
    return undefined;
  }
}

export function clearStationMeta(configPath: string): void {
  rmSync(stationMetaPath(configPath), { force: true });
}

/** True if a process with `pid` currently exists. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Single-shot `/health` probe. */
export function probeHealth(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise<boolean>((res) => {
    const req = httpGet({ host: '127.0.0.1', port, path: '/health', timeout: timeoutMs }, (r) => {
      r.resume();
      res(true);
    });
    req.on('error', () => res(false));
    req.on('timeout', () => {
      req.destroy();
      res(false);
    });
  });
}

/**
 * Probe `port` before spending time loading apps. A station answering on
 * `/health` is reported precisely; otherwise a bind probe tells us whether some
 * other process holds the port.
 */
export async function detectPortState(port: number): Promise<PortState> {
  if (await probeHealth(port)) return 'station';

  const bindable = await new Promise<boolean>((res) => {
    const tester = createNetServer();
    tester.once('error', () => res(false));
    tester.once('listening', () => tester.close(() => res(true)));
    tester.listen(port, '127.0.0.1');
  });
  return bindable ? 'free' : 'busy';
}

/** Poll `/health` until it answers or the deadline passes. */
export async function waitForHealth(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeHealth(port)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** Wait until `pid` is no longer alive, or the deadline passes. */
async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return !isProcessAlive(pid);
}

/**
 * Spawn the station as a detached background process that outlives the CLI,
 * record its metadata, and wait until it is serving before returning.
 */
export async function launchDetachedStation(
  configPath: string,
  port: number,
  stationUrl?: string,
): Promise<HandlerResult> {
  mkdirSync(stateDir(configPath), { recursive: true });
  const logPath = stationLogPath(configPath);
  const logFd = openSync(logPath, 'w');

  const args = ['--config', configPath, 'serve', '--foreground', String(port)];
  if (stationUrl) args.push(stationUrl);

  // POLICY-REQ-7: a per-launch local admin token, known only to this CLI and the station.
  const adminToken = randomBytes(32).toString('hex');
  // The single executable is its own entry; a Node build re-runs dist/bin.js.
  const command = isExecutable ? [...args] : [resolveBinPath(), ...args];
  const child = spawn(process.execPath, command, {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    cwd: dirname(configPath),
    env: { ...process.env, AGENTAPPS_ADMIN_TOKEN: adminToken },
  });
  child.unref();
  // The child dup'd the log fd at spawn time; release the parent's copy.
  closeSync(logFd);

  const { pid } = child;
  const url = `http://localhost:${port}`;

  const healthy = await waitForHealth(port, 20_000);
  if (!pid || !healthy) {
    return {
      success: false,
      exitCode: 1,
      error: {
        message: `Station failed to start on ${url}.`,
        suggestion: `Check the log for details: ${logPath}`,
      },
    };
  }

  const meta: StationMeta = {
    pid,
    port,
    url,
    startedAt: new Date().toISOString(),
    logPath,
    adminToken,
  };
  writeFileSync(stationMetaPath(configPath), `${JSON.stringify(meta, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });

  return {
    success: true,
    exitCode: 0,
    message: `Station running in the background at ${url}`,
    data: { PID: pid, URL: url, Logs: logPath, Stop: 'station stop' },
  };
}

/**
 * Stop the tracked detached station: SIGTERM the pid, wait for it to exit
 * (escalating to SIGKILL), and clear its metadata. Returns the port it was on,
 * or null if nothing was tracked/alive.
 */
export async function stopDetachedStation(configPath: string): Promise<number | null> {
  const meta = readStationMeta(configPath);
  if (!meta || !isProcessAlive(meta.pid)) {
    clearStationMeta(configPath);
    return null;
  }

  try {
    process.kill(meta.pid, 'SIGTERM');
  } catch {
    // Already gone.
  }

  const exited = await waitForExit(meta.pid, 5000);
  if (!exited && isProcessAlive(meta.pid)) {
    try {
      process.kill(meta.pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
    await waitForExit(meta.pid, 2000);
  }

  clearStationMeta(configPath);
  return meta.port;
}
