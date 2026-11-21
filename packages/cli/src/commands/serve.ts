/**
 * @agentapps/cli — serve command.
 *
 * Starts a production StationServer that loads all apps from the workspace
 * config and serves the Agent Apps v2.0 protocol over HTTP.
 *
 * Usage:
 *   agentapps serve [port] [stationUrl]
 *
 * The optional stationUrl tells the app station where to announce its apps
 * on startup so the station discovers them automatically.
 */

import { hostname } from 'node:os';
import {
  type AppEntry,
  FileDocumentStore,
  type SecretsManager,
  type StationEndpoint,
  StationServer,
} from '@agentapps/station';
import { resolveSourcePath } from '../config.js';
import { InstallationSecretsStore, workspaceStoragePath } from '../host.js';
import { resolveApp } from '../resolve.js';
import { loadAppSecrets } from '../secrets-store.js';
import { getInstallationById, loadApiKeys, loadInstallations } from '../state.js';
import { detectPortState, launchDetachedStation } from '../station-lifecycle.js';
import { createLocalApiKeyStore, createLocalPolicyStore } from '../station-stores.js';
import type { HandlerResult, ReplCommand } from '../types.js';
import { CLAUDE_CODE_EVENTS, ClaudeCodeBridge, claudeCodeRoute } from './hooks-claude-code.js';
import type { HandlerContext } from './types.js';

/**
 * Build a SecretsManager backed by the CLI's local stores, so served apps can
 * resolve `ctx.systemSecret()` / `ctx.installationSecret()` exactly like the REPL does:
 *   - system secrets: `.secrets/apps/<appId>.json` (shared per app)
 *   - installation secrets:   `.agentapps/installation-secrets/<alias>.json` (per installed instance)
 *
 * Serve sessions are keyed by appId, so installation secrets resolve through the first
 * installed instance of that app.
 */
function createLocalSecretsManager(configPath: string): SecretsManager {
  /** Resolve the appId for an installationId by querying the instance registry. */
  const resolveAppId = (installationId: string): string | undefined =>
    getInstallationById(configPath, installationId)?.appId;

  return {
    async getSystemSecrets({ installationId }) {
      // System secrets are shared per app type, so resolve installationId → appId.
      const appId = resolveAppId(installationId) ?? installationId;
      const secrets = loadAppSecrets(configPath, appId);
      return Object.keys(secrets).length > 0 ? secrets : null;
    },
    async getInstallationSecrets({ installationId }) {
      const store = new InstallationSecretsStore(configPath, installationId);
      const secrets = store.read();
      return Object.keys(secrets).length > 0 ? secrets : null;
    },
    async updateInstallationSecrets({ installationId }, secrets) {
      const store = new InstallationSecretsStore(configPath, installationId);
      store.merge(secrets);
      return true;
    },
  };
}

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
  const appEntries = Object.entries(ctx.config.apps);

  if (appEntries.length === 0) {
    return {
      success: false,
      exitCode: 1,
      error: { message: 'No apps found in workspace config. Add apps to agentapps.json.' },
    };
  }

  const port = command.port ?? ctx.config.station?.port ?? 4100;

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
    return launchDetachedStation(ctx.configPath, port, command.stationUrl);
  }

  const apps: AppEntry[] = [];
  const errors: string[] = [];
  const resolvedApps: Array<{ id: string; app: Awaited<ReturnType<typeof resolveApp>> }> = [];

  // Build station endpoints from the stationUrl argument
  const stations: StationEndpoint[] = [];
  if (command.stationUrl) {
    stations.push({ url: command.stationUrl });
  }

  process.stdout.write('Loading apps...\n');

  for (const [appId, entry] of appEntries) {
    try {
      const source = resolveSourcePath(ctx.configPath, entry.source);
      const resolved = await resolveApp(appId, source);
      const manifest = resolved.manifest ?? {};
      resolvedApps.push({ id: (manifest.id as string) ?? appId, app: resolved });
      apps.push({
        id: (manifest.id as string) ?? appId,
        version: (manifest.version as string) ?? '0.0.0',
        factory: resolved.factory,
        name: resolved.name,
        description: manifest.description as string | undefined,
        auth: manifest.auth as AppEntry['auth'],
        manifest,
        sourcePath: resolved.sourcePath,
      });
      process.stdout.write(`  ✓ ${(manifest.id as string) ?? appId}\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${appId}: ${message}`);
      process.stderr.write(`  ✗ ${appId}: ${message}\n`);
    }
  }

  if (apps.length === 0) {
    return {
      success: false,
      exitCode: 1,
      error: { message: `All apps failed to load:\n${errors.join('\n')}` },
    };
  }

  // Public URL for OAuth callbacks. Priority:
  //   1. CLI flag:    --publicUrl https://your-station.example.com
  //   2. Env var:     PUBLIC_URL=https://your-station.example.com
  //   3. Config file: agentapps.json → station.publicUrl
  //   4. Auto-detect: http://localhost:{port}
  const publicUrl =
    ((command as Record<string, unknown>).publicUrl as string | undefined) ??
    process.env.PUBLIC_URL ??
    ctx.config.station?.publicUrl ??
    undefined;

  const hookBridge = new ClaudeCodeBridge(ctx.configPath, resolvedApps);
  const server = new StationServer({
    apps,
    port,
    stations,
    publicUrl,
    stationId: `serve-${hostname()}-${port}`,
    secrets: createLocalSecretsManager(ctx.configPath),
    // CLI-REQ-3: the same on-disk Storage the CLI uses, not process memory.
    documentStore: new FileDocumentStore(workspaceStoragePath(ctx.configPath)),
    resolveInstallation: (installationId) => {
      const instance = getInstallationById(ctx.configPath, installationId);
      return instance ? { appId: instance.appId } : undefined;
    },
    // POLICY-REQ-10: Gateways discover and open sessions as these Installations.
    installations: () =>
      loadInstallations(ctx.configPath).map((i) => ({
        installationId: i.installationId,
        alias: i.alias,
        appId: i.appId,
        ...(i.permissions ? { permissions: i.permissions } : {}),
      })),
    // Permissions and API keys are backed by the CLI state files, so `permission` /
    // `key` commands apply to this running station without a restart. While
    // no active key exists the station stays open (no auth required).
    policies: createLocalPolicyStore(ctx.configPath),
    apiKeys: createLocalApiKeyStore(ctx.configPath),
    // POLICY-REQ-7: the CLI that launched this station answers its approvals.
    adminToken: process.env.AGENTAPPS_ADMIN_TOKEN,
    // HOOK-REQ-26: the Claude Code adapter's events, answered by the apps hosted here.
    adminRoutes: Object.fromEntries(
      CLAUDE_CODE_EVENTS.map((event) => [
        claudeCodeRoute(event),
        (body: unknown) => hookBridge.handle(event, body as Record<string, unknown>),
      ]),
    ),
  });

  let info: Awaited<ReturnType<typeof server.start>>;
  try {
    info = await server.start();
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

  const authBase = publicUrl ?? info.url;
  const now = new Date();
  const activeKeys = loadApiKeys(ctx.configPath).filter(
    (k) => !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt) > now),
  );
  process.stdout.write(`\n✓ AppStation server ready: ${info.url}\n`);
  process.stdout.write(`  Apps: ${info.apps.join(', ')}\n`);
  process.stdout.write(`  OAuth callback: ${authBase}/auth/callback\n`);
  process.stdout.write(
    activeKeys.length > 0
      ? `  Auth: ${activeKeys.length} active API key(s) — Bearer token required\n`
      : '  Auth: open — create an API key ("key create") to require authentication\n',
  );
  if (stations.length > 0) {
    process.stdout.write(`  Announcing to: ${stations.map((s) => s.url).join(', ')}\n`);
  }
  if (errors.length > 0) {
    process.stdout.write(`  Failed: ${errors.length}\n`);
  }
  process.stdout.write('\nPress Ctrl+C to stop.\n');

  const shutdown = async () => {
    process.stdout.write('\nShutting down...\n');
    await hookBridge.stop();
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Block forever — the server runs until killed
  await new Promise(() => {});

  return { success: true, exitCode: 0 };
}
