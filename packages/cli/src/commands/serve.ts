/**
 * @agentapps/cli — serve command.
 *
 * Starts the workspace's Station. The public command launches it detached, so
 * it outlives the terminal; the detached worker runs this same code with the
 * internal `--foreground` flag and blocks.
 */

import type { StationEndpoint } from '@agentapps/station';
import { loadApiKeys } from '../state.js';
import { detectPortState, launchDetachedStation } from '../station-lifecycle.js';
import { stationPublicUrl } from '../station-url.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import {
  createWorkspaceStation,
  MissingStationSetting,
  type WorkspaceStation,
  workspaceStationIds,
} from '../workspace-station.js';
import type { HandlerContext } from './types.js';

/**
 * @spec SETUP-REQ-11
 * @spec STADMIN-REQ-11
 * @spec CLIENT-REQ-10
 */
export async function handleServe(
  command: ReplCommand,
  context: HandlerContext,
): Promise<HandlerResult> {
  if (command.type !== 'serve') {
    return {
      success: false,
      exitCode: 2,
      error: { message: 'Internal error: expected serve command' },
    };
  }

  const { ctx } = context;
  // CLIENT-REQ-10: the `station` block describes the Station started here; the
  // CLI's own `cli.stationUrl` is not read.
  const port = command.port ?? ctx.config.station?.port ?? 4100;

  // SETUP-REQ-11, STADMIN-REQ-11: no public URL or no ids, no Station. Checked
  // before any port is touched.
  const publicUrl = stationPublicUrl(context.options, ctx.config);
  if (typeof publicUrl !== 'string') return publicUrl;
  try {
    workspaceStationIds(ctx.configPath);
  } catch (err) {
    if (err instanceof MissingStationSetting) {
      return {
        success: false,
        exitCode: 2,
        error: { message: err.message, suggestion: err.suggestion },
      };
    }
    throw err;
  }

  // `serve` always runs the station detached so it outlives the CLI/terminal.
  // The public command spawns a worker (this same code re-invoked with the
  // internal --foreground flag) which performs the blocking work below.
  if (!context.options.foreground) {
    // Fail fast if the port is taken — don't spawn a worker that can't bind.
    const portState = await detectPortState(port);
    if (portState === 'station') {
      return {
        success: false,
        exitCode: 1,
        error: {
          message: `A station is already running on http://localhost:${port}.`,
          suggestion: `Stop it first, or start this one on another port: serve <port>.`,
        },
      };
    }
    if (portState === 'busy') {
      return {
        success: false,
        exitCode: 1,
        error: {
          message: `Port ${port} is already in use by another process.`,
          suggestion: `Free the port or start the station on another port: serve <port>.`,
        },
      };
    }
    return launchDetachedStation(
      ctx.configPath,
      port,
      command.stationUrl,
      context.options.publicUrl,
    );
  }

  // Build station endpoints from the stationUrl argument
  const stations: StationEndpoint[] = [];
  if (command.stationUrl) {
    stations.push({ url: command.stationUrl });
  }

  process.stdout.write('Loading apps...\n');
  let station: WorkspaceStation;
  try {
    station = await createWorkspaceStation(ctx.configPath, {
      port,
      host: ctx.config.station?.host ?? '127.0.0.1',
      publicUrl,
      stations,
      adminToken: process.env.AGENTAPPS_ADMIN_TOKEN,
      log: (line) => (line.includes('✗') ? process.stderr : process.stdout).write(`${line}\n`),
    });
  } catch (err) {
    return {
      success: false,
      exitCode: 1,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }

  // DIST-REQ-11: the Station starts with what there is, even with no app at all.
  if (station.apps.length === 0 && station.errors.length > 0) {
    return {
      success: false,
      exitCode: 1,
      error: { message: `All apps failed to load:\n${station.errors.join('\n')}` },
    };
  }

  let info: Awaited<ReturnType<typeof station.server.start>>;
  try {
    info = await station.server.start();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Covers the narrow race where the port was free at the pre-check but got
    // taken before we bound to it.
    if (/EADDRINUSE/.test(message)) {
      return {
        success: false,
        exitCode: 1,
        error: {
          message: `Port ${port} is already in use — is a station already running?`,
          suggestion: `Stop it first, or start this one on another port: serve <port>.`,
        },
      };
    }
    throw err;
  }

  const now = new Date();
  const activeKeys = loadApiKeys(ctx.configPath).filter(
    (k) => !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt) > now),
  );
  process.stdout.write(`\n✓ AppStation server ready: ${info.url}\n`);
  process.stdout.write(`  Station: ${info.stationId}\n`);
  process.stdout.write(`  Apps: ${info.apps.join(', ')}\n`);
  process.stdout.write(`  OAuth callback: ${info.oauthCallbackUrl}\n`);
  process.stdout.write(
    activeKeys.length > 0
      ? `  Auth: ${activeKeys.length} active API key(s) — Bearer token required\n`
      : '  Auth: open — create an API key ("key create") to require authentication\n',
  );
  if (stations.length > 0) {
    process.stdout.write(`  Announcing to: ${stations.map((s) => s.url).join(', ')}\n`);
  }
  if (station.errors.length > 0) {
    process.stdout.write(`  Failed: ${station.errors.length}\n`);
  }
  process.stdout.write('\nPress Ctrl+C to stop.\n');

  const shutdown = async () => {
    process.stdout.write('\nShutting down...\n');
    await station.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Block forever — the server runs until killed
  await new Promise(() => {});

  return { success: true, exitCode: 0 };
}
