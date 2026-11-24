/**
 * @agentapps/cli — station lifecycle command.
 *
 * Controls the detached background station started by `serve`:
 *   station start [port]   — start it (same as `serve`)
 *   station status         — is it running? where? for how long?
 *   station stop           — stop the tracked station
 *   station restart [port] — stop then start
 */

import {
  detectPortState,
  isProcessAlive,
  launchDetachedStation,
  probeHealth,
  readStationMeta,
  stopDetachedStation,
} from '../station-lifecycle.js';
import { stationPublicUrl } from '../station-url.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import type { HandlerContext } from './types.js';

/** Format a millisecond duration as a compact `1h 2m 3s`. */
function formatUptime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (h || m) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(' ');
}

async function stationStatus(configPath: string, defaultPort: number): Promise<HandlerResult> {
  const meta = readStationMeta(configPath);

  if (meta) {
    const alive = isProcessAlive(meta.pid);
    const healthy = alive && (await probeHealth(meta.port));
    if (alive && healthy) {
      const uptime = formatUptime(Date.now() - new Date(meta.startedAt).getTime());
      return {
        success: true,
        message: `Station running at ${meta.url}`,
        data: {
          Status: '✓ running',
          URL: meta.url,
          PID: meta.pid,
          Port: meta.port,
          Uptime: uptime,
          Logs: meta.logPath,
        },
        exitCode: 0,
      };
    }
    if (alive && !healthy) {
      return {
        success: true,
        message: `Station process is alive (PID ${meta.pid}) but not answering on ${meta.url}.`,
        data: { Status: '● not responding', PID: meta.pid, Logs: meta.logPath },
        exitCode: 0,
      };
    }
    // Recorded process is gone — the record is stale.
    return {
      success: true,
      message: 'No station running (cleared a stale record).',
      data: { Status: '○ stopped', hint: 'Start one with: station start' },
      exitCode: 0,
    };
  }

  // No record of one we started — maybe an externally-launched station answers.
  if (await probeHealth(defaultPort)) {
    return {
      success: true,
      message: `A station is answering on http://localhost:${defaultPort}, but it was not started by this CLI (no PID on record).`,
      data: {
        Status: '✓ running (unmanaged)',
        URL: `http://localhost:${defaultPort}`,
        hint: 'Not stoppable via "station stop" — no tracked PID.',
      },
      exitCode: 0,
    };
  }

  return {
    success: true,
    message: 'No station running.',
    data: { Status: '○ stopped', hint: 'Start one with: station start' },
    exitCode: 0,
  };
}

async function stationStop(configPath: string): Promise<HandlerResult> {
  const port = await stopDetachedStation(configPath);
  if (port === null) {
    return {
      success: true,
      message: 'No station to stop (none tracked as running).',
      exitCode: 0,
    };
  }
  return {
    success: true,
    message: `Station stopped (was on port ${port}).`,
    exitCode: 0,
  };
}

async function stationStart(
  configPath: string,
  port: number,
  stationUrl: string | undefined,
  publicUrl: string | undefined,
): Promise<HandlerResult> {
  const portState = await detectPortState(port);
  if (portState === 'station') {
    return {
      success: false,
      exitCode: 1,
      error: {
        message: `A station is already running on http://localhost:${port}.`,
        suggestion: `Use "station status", or start on another port: station start <port>.`,
      },
    };
  }
  if (portState === 'busy') {
    return {
      success: false,
      exitCode: 1,
      error: {
        message: `Port ${port} is already in use by another process.`,
        suggestion: `Free the port or start on another port: station start <port>.`,
      },
    };
  }
  return launchDetachedStation(configPath, port, stationUrl, publicUrl);
}

async function stationRestart(
  configPath: string,
  requestedPort: number | undefined,
  defaultPort: number,
  stationUrl: string | undefined,
  publicUrl: string | undefined,
): Promise<HandlerResult> {
  // Prefer the port the station was already on unless one was explicitly given.
  const prev = readStationMeta(configPath);
  const port = requestedPort ?? prev?.port ?? defaultPort;
  await stopDetachedStation(configPath);
  return launchDetachedStation(configPath, port, stationUrl, publicUrl);
}

/**
 * `station start|status|stop|restart`: the Station this workspace starts.
 * These work with no Station running; they are how one comes to run.
 *
 * @spec CLIENT-REQ-7
 */
export async function handleStation(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'station') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected station command' },
    };
  }

  const { ctx } = context;
  const configPath = ctx.configPath;
  const defaultPort = command.port ?? ctx.config.station?.port ?? 4100;

  switch (command.action) {
    case 'status':
      return stationStatus(configPath, defaultPort);
    case 'stop':
      return stationStop(configPath);
    case 'start':
    case 'restart': {
      // SETUP-REQ-11: checked before anything is started or stopped.
      const publicUrl = stationPublicUrl(context.options, ctx.config);
      if (typeof publicUrl !== 'string') return publicUrl;
      return command.action === 'start'
        ? stationStart(configPath, defaultPort, command.stationUrl, context.options.publicUrl)
        : stationRestart(
            configPath,
            command.port,
            defaultPort,
            command.stationUrl,
            context.options.publicUrl,
          );
    }
  }
}
