/**
 * @agentapps/cli — the Station of a workspace.
 *
 * Builds the Station that `serve` runs: the workspace's Apps, and its state,
 * secrets and data kept in the files where a workspace has always kept them.
 * This is the only place where the CLI's code touches those files, and it
 * runs in the Station's process, not in a command's.
 */

import { join } from 'node:path';
import { AppIdRegex } from '@agentapps/protocol';
import {
  type AppCatalog,
  type AppEntry,
  LocalDataStore,
  LocalSecretStore,
  type StationEndpoint,
  StationServer,
} from '@agentapps/station';
import { downloadAppPackages } from './app-store.js';
import {
  CLAUDE_CODE_EVENTS,
  ClaudeCodeBridge,
  claudeCodeRoute,
} from './commands/hooks-claude-code.js';
import {
  addAppSource,
  loadWorkspaceConfig,
  needsDownload,
  removeAppSource,
  resolveSourcePath,
} from './config.js';
import { workspaceDataPath, workspaceStoragePath } from './data-paths.js';
import { resolveApp } from './resolve.js';
import { appSecretsDir } from './secrets-store.js';
import { stateDir } from './state.js';
import {
  createLocalApiKeyStore,
  createLocalBindingStore,
  createLocalInstallationStore,
  createLocalPolicyStore,
  createLocalWorkspaceStore,
} from './station-stores.js';
import type { ResolvedApp } from './types.js';

/** The directory name a workspace has always kept its one Workspace's files under. */
const HOME_WORKSPACE_DIRECTORY = 'default';

/**
 * A setting the Station does not start without, and how to give it.
 *
 * @spec STADMIN-REQ-11
 */
export class MissingStationSetting extends Error {
  constructor(
    message: string,
    readonly suggestion: string,
  ) {
    super(message);
  }
}

export interface WorkspaceStationOptions {
  port: number;
  host: string;
  publicUrl: string;
  /** Stations to announce to on start. */
  stations?: StationEndpoint[];
  /** The admin credential of the CLI that starts this Station. */
  adminToken?: string;
  /** Where progress is written; nowhere when absent. */
  log?: (line: string) => void;
}

export interface WorkspaceStation {
  server: StationServer;
  /** The Apps that were loaded. */
  apps: string[];
  /** One line per App that failed to load. */
  errors: string[];
  stop(): Promise<void>;
}

/**
 * The ids a workspace's Station is started with. Neither is computed: both
 * are written when the config is created, and a config without them says how
 * to add them.
 *
 * @spec STADMIN-REQ-11
 */
export function workspaceStationIds(configPath: string): {
  stationId: string;
  workspaceId: string;
} {
  const config = loadWorkspaceConfig(configPath);
  const stationId = config.station?.id;
  if (!stationId) {
    throw new MissingStationSetting(
      'The Station has no id, and it does not start without one.',
      'Add one to agentapps.json, and never change it afterwards:\n  "station": { "id": "<a name of your choice>" }',
    );
  }
  const workspaceId = config.workspace?.id;
  if (!workspaceId) {
    throw new MissingStationSetting(
      'The workspace has no id, and its Station does not start without one.',
      'Add one to agentapps.json, and never change it afterwards:\n  "workspace": { "id": "<a name of your choice>" }',
    );
  }
  return { stationId, workspaceId };
}

/**
 * Build the Station of the workspace at `configPath`, not yet started. Only
 * `serve` calls this: no other command hosts a Station or runs an App.
 *
 * @spec CLIENT-REQ-2
 * @spec STADMIN-REQ-7
 * @spec SECRETSTORE-REQ-8
 * @spec DATASTORE-REQ-7
 */
export async function createWorkspaceStation(
  configPath: string,
  options: WorkspaceStationOptions,
): Promise<WorkspaceStation> {
  const { stationId, workspaceId } = workspaceStationIds(configPath);
  const log = options.log ?? (() => {});
  const state = stateDir(configPath);
  const errors: string[] = [];
  const resolvedApps: Array<{ id: string; app: ResolvedApp }> = [];
  // Sources already looked at, loaded or failed, so each is tried once.
  const seen = new Set<string>();
  const sources = new Map<string, string>();

  const loadApp = async (appId: string, source: string): Promise<AppEntry | undefined> => {
    seen.add(source);
    try {
      const resolved = await resolveApp(appId, resolveSourcePath(configPath, source));
      const manifest = resolved.manifest ?? {};
      const id = (manifest.id as string) ?? appId;
      resolvedApps.push({ id, app: resolved });
      sources.set(id, source);
      log(`  ✓ ${id}`);
      return {
        id,
        version: (manifest.version as string) ?? '0.0.0',
        factory: resolved.factory,
        name: (manifest.name as string | undefined) ?? resolved.name,
        description: manifest.description as string | undefined,
        auth: manifest.auth as AppEntry['auth'],
        manifest,
        sourcePath: resolved.sourcePath,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${appId}: ${message}`);
      log(`  ✗ ${appId}: ${message}`);
      return undefined;
    }
  };

  const apps: AppEntry[] = [];
  for (const [appId, entry] of Object.entries(loadWorkspaceConfig(configPath).apps)) {
    // DIST-REQ-11: a catalog app that has not been downloaded is not a failure.
    if (needsDownload(configPath, entry.source)) continue;
    const app = await loadApp(appId, entry.source);
    if (app) apps.push(app);
  }

  /** Download a listed `npm:` source that is not on disk yet. @spec DIST-REQ-3 */
  const download = async (appId: string, source: string): Promise<void> => {
    if (!needsDownload(configPath, source)) return;
    const spec = source.slice('npm:'.length);
    const { code, stderr } = await downloadAppPackages(configPath, [spec]);
    if (code !== 0 || needsDownload(configPath, source)) {
      const reason = stderr.replace(/^ERR /, '').trim();
      throw new Error(`Could not download ${appId} (${spec})${reason ? `: ${reason}` : ''}`);
    }
  };

  /** @spec STADMIN-REQ-9 */
  const appCatalog: AppCatalog = {
    async add(given: string): Promise<AppEntry> {
      // An App id stands for its package in the registry, `@agentapps/<appId>`.
      let source = given;
      if (AppIdRegex.test(given)) {
        const known = loadWorkspaceConfig(configPath).apps[given];
        source = known?.source ?? `npm:@agentapps/${given}`;
      }
      if (source.startsWith('npm:') && needsDownload(configPath, source)) {
        const spec = source.slice('npm:'.length);
        const { code, stderr } = await downloadAppPackages(configPath, [spec]);
        if (code !== 0) {
          if (stderr.includes('is not in the registry')) throw new Error(`App not found: ${given}`);
          throw new Error(`Could not download ${given}: ${stderr.replace(/^ERR /, '').trim()}`);
        }
      }
      let sourcePath: string;
      try {
        sourcePath = resolveSourcePath(configPath, source);
      } catch {
        throw new Error(`App not found: ${given}`);
      }
      addAppSource(configPath, source);
      const listed = Object.entries(loadWorkspaceConfig(configPath).apps).find(
        ([, entry]) => entry.source === source,
      );
      const entry = await loadApp(listed?.[0] ?? given, source);
      if (!entry) {
        removeAppSource(configPath, source);
        throw new Error(`App not found: ${given} (nothing loadable at ${sourcePath})`);
      }
      return entry;
    },
    async remove(appId: string): Promise<void> {
      const source = sources.get(appId) ?? loadWorkspaceConfig(configPath).apps[appId]?.source;
      if (source) removeAppSource(configPath, source);
      sources.delete(appId);
    },
    async prepare(appId: string): Promise<AppEntry | undefined> {
      const listed = loadWorkspaceConfig(configPath).apps[appId];
      if (!listed) return undefined;
      await download(appId, listed.source);
      return loadApp(appId, listed.source);
    },
    sourceOf: (appId) => sources.get(appId),
  };

  const secretStore = new LocalSecretStore({
    stationId,
    systemSecretsDir: appSecretsDir(configPath),
    installationSecretsDir: join(state, 'installation-secrets'),
    linkSigningSecretPath: join(state, 'station-secret'),
    otherStationsDir: join(state, 'stations'),
  });
  // CLI-REQ-14: a secret given in the environment is the Station's; it is kept
  // in the Secret Store, which is where the Station takes it from.
  if (process.env.AGENTAPPS_STATION_SECRET) {
    await secretStore.setLinkSigningSecret({ stationId }, process.env.AGENTAPPS_STATION_SECRET);
  }

  const hookBridge = new ClaudeCodeBridge(configPath, resolvedApps);
  const server = new StationServer({
    apps,
    port: options.port,
    // CLI-REQ-12: this machine only, unless the workspace names another address;
    // and while no key exists, only this machine is served without a credential.
    host: options.host,
    openToLoopbackOnly: true,
    stations: options.stations ?? [],
    publicUrl: options.publicUrl,
    stationId,
    workspaceId,
    secretStore,
    dataStore: new LocalDataStore({
      stationId,
      storageDir: workspaceStoragePath(configPath),
      dataDir: workspaceDataPath(configPath),
      otherStationsDir: join(state, 'stations'),
      workspaceAlias: { id: workspaceId, directory: HOME_WORKSPACE_DIRECTORY },
    }),
    // DIST-REQ-13: apps downloaded, or added to the workspace, after the start.
    discoverApps: async () => {
      const found: AppEntry[] = [];
      for (const [appId, entry] of Object.entries(loadWorkspaceConfig(configPath).apps)) {
        if (seen.has(entry.source) || needsDownload(configPath, entry.source)) continue;
        const app = await loadApp(appId, entry.source);
        if (app) found.push(app);
      }
      return found;
    },
    installations: createLocalInstallationStore(configPath),
    bindings: createLocalBindingStore(configPath),
    workspaces: createLocalWorkspaceStore(configPath),
    policies: createLocalPolicyStore(configPath),
    apiKeys: createLocalApiKeyStore(configPath),
    appCatalog,
    // POLICY-REQ-7: the CLI that launched this station answers its approvals.
    adminToken: options.adminToken,
    // HOOK-REQ-26: the Claude Code adapter's events, answered by the apps hosted here.
    adminRoutes: Object.fromEntries(
      CLAUDE_CODE_EVENTS.map((event) => [
        claudeCodeRoute(event),
        (body: unknown) => hookBridge.handle(event, body as Record<string, unknown>),
      ]),
    ),
  });

  return {
    server,
    apps: apps.map((a) => a.id),
    errors,
    async stop(): Promise<void> {
      await hookBridge.stop();
      await server.stop();
    },
  };
}
