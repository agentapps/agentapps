/**
 * @agentapps/cli — where Stations are.
 *
 * Two different settings of `agentapps.json`:
 * - `station.publicUrl`: the public URL of the Station this workspace starts.
 * - `cli.stationUrl`: the Station the CLI connects to.
 */

import type { GlobalOptions, HandlerResult, WorkspaceConfig } from './types.js';

/** The values the CLI writes for a Station on this machine (SETUP-REQ-12). */
export const LOCAL_STATION_HOST = '127.0.0.1';
export const LOCAL_STATION_PORT = 4100;
export const LOCAL_STATION_URL = `http://localhost:${LOCAL_STATION_PORT}`;

function failure(message: string, suggestion: string): HandlerResult {
  return { success: false, exitCode: 2, error: { message, suggestion } };
}

/**
 * The public URL of the Station about to be started: `--public-url`, or
 * `station.publicUrl` of the workspace config. There is no default: without
 * either, the result is the error to return.
 *
 * @spec SETUP-REQ-11
 */
export function stationPublicUrl(
  options: Pick<GlobalOptions, 'publicUrl'>,
  config: WorkspaceConfig,
): string | HandlerResult {
  const publicUrl = options.publicUrl ?? config.station?.publicUrl;
  if (publicUrl) return publicUrl;
  return failure(
    'The Station has no public URL, and it does not start without one.',
    `Set it in agentapps.json:\n` +
      `  "station": { "publicUrl": "${LOCAL_STATION_URL}" }\n` +
      `or pass it when starting the Station:\n` +
      `  agentapps serve --public-url ${LOCAL_STATION_URL}`,
  );
}

/**
 * The Station the CLI connects to: `cli.stationUrl` of the workspace config,
 * and nothing else. Without it, the result is the error to return.
 *
 * @spec SETUP-REQ-6
 */
export function cliStationUrl(config: WorkspaceConfig): string | HandlerResult {
  const stationUrl = config.cli?.stationUrl?.replace(/\/+$/, '');
  if (stationUrl) return stationUrl;
  return failure(
    'This workspace does not say which Station the CLI connects to.',
    `Set it with:\n  agentapps station use <url>\n` +
      `which writes it to agentapps.json:\n  "cli": { "stationUrl": "${LOCAL_STATION_URL}" }`,
  );
}

/**
 * Whether a URL names this machine: `localhost`, `127.0.0.1` or `::1`.
 *
 * @spec SETUP-REQ-7
 */
export function isLocalStationUrl(stationUrl: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(stationUrl).hostname;
  } catch {
    return false;
  }
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/**
 * The error for a Station that did not answer: on this machine, that none is
 * running and how to start it; anywhere else, that it cannot be reached.
 *
 * @spec SETUP-REQ-7
 */
export function stationUnreachable(stationUrl: string): HandlerResult {
  if (isLocalStationUrl(stationUrl)) {
    return failure(
      `No Station is running at ${stationUrl}.`,
      'Start it with:\n  agentapps station start',
    );
  }
  return failure(
    `Cannot connect to the Station at ${stationUrl}.`,
    'Check the URL and that the Station is reachable from this machine.',
  );
}
