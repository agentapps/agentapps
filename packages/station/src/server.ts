/**
 * Station Server
 *
 * Production HTTP server that wraps one or more AppStation instances and
 * serves the Agent Apps v2.0 protocol over POST /messages.
 *
 * Usage:
 *   import { StationServer, serve } from '@agentapps/station';
 *
 *   const server = await serve({
 *     port: 4100,
 *     apps: [{ id: 'app.hello', version: '1.0.0', factory }],
 *   });
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { hostname } from 'node:os';
import { join, normalize, relative, resolve, sep } from 'node:path';
import {
  ADMIN_PRINCIPAL_ID,
  type ApiKeyIdentity,
  createInProcessTransportPair,
  ErrorCode,
  type MessageBase,
  OBJECT_REQUEST_TYPES,
  type PermissionEffect,
  STORAGE_REQUEST_TYPES,
  type Transport,
} from '@agentapps/protocol';
import type { ApiKeyStore } from './api-key-store.js';
import { hashApiKey } from './api-key-store.js';
import { AppStation } from './app-station.js';
import { ApprovalManager } from './approval-manager.js';
import { handleStorageRequest, InMemoryDocumentStore } from './document-store.js';
import { handleObjectRequest, ObjectStore } from './file-handlers/object-store.js';
import { getStationSecret } from './file-handlers/signed-url.js';
import {
  getVolumesBasePath,
  handleVolumeRequest,
  resolveMountPath,
  VOLUME_REQUEST_TYPES,
  type VolumeHandlerContext,
} from './file-handlers/volume-handlers.js';
import { type AppFactory, InProcessRuntime } from './in-process-runtime.js';
import { OAuthManager, type OAuthStartParams } from './oauth-manager.js';
import { errorPage, successPage } from './oauth-pages.js';
import { evaluatePolicy } from './permission-enforcer.js';
import type { PolicyStore } from './policy-store.js';
import { policyFor } from './policy-store.js';
import type { SecretsManager } from './secrets-manager.js';

const SERVER_VERSION = '1.0.0';

/** Instance→host secret requests the server can answer via a SecretsManager. */
const SECRET_CALLBACK_TYPES = new Set([
  'get_system_secrets',
  'get_installation_secrets',
  'update_installation_secrets',
]);

// Storage (document store) for standalone/dev mode, kept in memory and
// scoped by installationId.
const inMemoryStorage = new InMemoryDocumentStore();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppEntry {
  id: string;
  version: string;
  factory: AppFactory;
  name?: string;
  description?: string;
  /** Auth configuration from the app manifest (authorizeUrl, tokenUrl, scopes, provider, etc.). */
  auth?: {
    type?: string;
    provider?: string;
    authorizeUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
    systemSecrets?: string[];
    installationSecrets?: string[];
  };
  /**
   * Full app manifest (agentapp.json). When provided, the server can serve
   * it via `GET /apps/:appId/manifest` and populate the launcher page.
   */
  manifest?: Record<string, unknown>;
  /**
   * Absolute path to the app's source directory. When provided, the server
   * can serve static files (bundles, assets) via `GET /apps/:appId/bundles/*`.
   */
  sourcePath?: string;
}

export interface StationEndpoint {
  /** URL of the station's announce endpoint (e.g., 'http://station:3000/api/agent-apps/announce') */
  url: string;
  /** Bearer token for authenticating with the station */
  token?: string;
}

export interface StationServerOptions {
  apps?: AppEntry[];
  port?: number;
  host?: string;
  token?: string;
  stationId?: string;
  idleTimeoutMs?: number;
  /**
   * Public base URL of the station (e.g. "https://your-station.example.com").
   *
   * Used to build the OAuth redirect URI (`{publicUrl}/auth/callback`)
   * for all apps — so individual apps don't need a REDIRECT_URI secret.
   * If omitted, auto-detected from `http://localhost:{port}`.
   */
  publicUrl?: string;
  /** Stations to announce to on startup. The station POSTs its app catalog so stations discover it automatically. */
  stations?: StationEndpoint[];
  /**
   * Host-side secret store. When provided, the server answers instance→host
   * secret requests (get_system_secrets / get_installation_secrets / update_installation_secrets).
   * Without it, those requests are rejected immediately instead of timing out.
   */
  secrets?: SecretsManager;
  /**
   * Resolve an installationId to its appId. Required for OAuth to find the
   * managed app. In CLI mode, this queries the instance registry.
   */
  resolveInstallation?: (installationId: string) => { appId: string } | undefined;
  /** API key store. When provided, enables multi-key authentication. */
  apiKeys?: ApiKeyStore;
  /** Policy store, one Policy per Principal. When provided, tool calls are evaluated (POLICY-REQ-5). */
  policies?: PolicyStore;
  /** Enable management API endpoints (/api/keys). Default: false. */
  enableManagementApi?: boolean;
  /** Timeout for parked `ask` calls in milliseconds. Default: 5 minutes (POLICY-REQ-6). */
  askTimeoutMs?: number;
  /**
   * Local admin credential: a bearer token that authenticates as the `admin`
   * Principal, so the CLI that launched this station can answer approvals
   * (POLICY-REQ-7) without an API key.
   */
  adminToken?: string;
  /**
   * Extra `POST` routes answered for the `admin` Principal only, such as the
   * CLI's Claude Code hook adapter (HOOK-REQ-26). The handler gets the parsed
   * JSON body and returns the JSON answer.
   */
  adminRoutes?: Record<string, (body: unknown) => Promise<unknown>>;
  /**
   * Base path for volume storage. Each installation gets a physical
   * directory under `{volumesBasePath}/ws_{workspaceId}/inst_{installationId}/workspace/`.
   * Defaults to `~/.agentapps/data` or the `AGENTAPPS_VOLUMES_BASE_PATH` env var.
   */
  volumesBasePath?: string;
  /**
   * Object store override. When omitted the server builds one on
   * `volumesBasePath`, its secret and its public URL once it starts.
   */
  objectStore?: ObjectStore;
}

export interface ServerInfo {
  port: number;
  host: string;
  url: string;
  stationId: string;
  apps: string[];
  /** OAuth callback URI used for all apps. */
  oauthCallbackUrl: string;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/** Result of authenticating an incoming request. `false` = rejected. */
type AuthResult =
  | {
      identity?: ApiKeyIdentity;
      /** The Principal the credential authenticates as (POLICY-REQ-1). */
      principalId: string;
    }
  | false
  | null;

interface ManagedApp {
  entry: AppEntry;
  appStation: AppStation;
  hostSide: Transport;
  initialized: boolean;
  pending: Map<
    string,
    { resolve: (msg: MessageBase) => void; timer: ReturnType<typeof setTimeout> }
  >;
}

let idCounter = 0;

function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// StationServer
// ---------------------------------------------------------------------------

export class StationServer {
  private managedApps = new Map<string, ManagedApp>();
  private sessionIndex = new Map<string, string>();
  private httpServer: ReturnType<typeof createServer> | null = null;
  private _info: ServerInfo | null = null;

  private readonly stationId: string;
  private readonly token?: string;
  private readonly idleTimeoutMs: number;
  private readonly defaultPort: number;
  private readonly defaultHost: string;
  private readonly stations: StationEndpoint[];
  private readonly secrets?: SecretsManager;
  private readonly resolveInstallation?: (installationId: string) => { appId: string } | undefined;
  private readonly oauth = new OAuthManager();
  private readonly publicUrl?: string;
  private readonly apiKeyStore?: ApiKeyStore;
  private readonly policyStore?: PolicyStore;
  private readonly approvalManager?: ApprovalManager;
  private readonly adminToken?: string;
  private readonly adminRoutes: Record<string, (body: unknown) => Promise<unknown>>;
  private readonly enableManagementApi: boolean;
  private readonly volumesBasePath: string;
  private readonly stationSecret: string;
  /** Objects: immutable blobs per Installation, served at GET /objects/{id}. */
  private objectStore: ObjectStore | null;
  /** Installation and Workspace of each open session, for scoping object Requests. */
  private readonly sessionScopes = new Map<
    string,
    { installationId: string; workspaceId: string; permissions?: { volume?: boolean } }
  >();
  /** Cached tool definitions per app for annotation lookups. */
  private readonly toolsCache = new Map<
    string,
    Array<{ name: string; annotations?: Record<string, unknown> }>
  >();

  constructor(options: StationServerOptions = {}) {
    this.stationId = options.stationId ?? `station-${hostname()}-${options.port ?? 4100}`;
    this.token = options.token;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 10 * 60 * 1000;
    this.defaultPort = options.port ?? 4100;
    this.defaultHost = options.host ?? '0.0.0.0';
    this.stations = options.stations ?? [];
    this.secrets = options.secrets;
    this.resolveInstallation = options.resolveInstallation;
    this.publicUrl = options.publicUrl;
    this.apiKeyStore = options.apiKeys;
    this.policyStore = options.policies;
    this.approvalManager = options.policies
      ? new ApprovalManager({ timeoutMs: options.askTimeoutMs })
      : undefined;
    this.adminToken = options.adminToken;
    this.adminRoutes = options.adminRoutes ?? {};
    this.enableManagementApi = options.enableManagementApi ?? false;
    this.volumesBasePath = getVolumesBasePath(options.volumesBasePath);
    this.stationSecret = getStationSecret();
    this.objectStore = options.objectStore ?? null;

    for (const app of options.apps ?? []) {
      this.addApp(app);
    }
  }

  // -------------------------------------------------------------------------
  // App management
  // -------------------------------------------------------------------------

  addApp(entry: AppEntry): void {
    if (this.managedApps.has(entry.id)) {
      throw new Error(`App ${entry.id} already registered`);
    }

    const runtime = new InProcessRuntime(entry.factory);
    const mountVolume = (entry.manifest?.runtime as { mountVolume?: boolean } | undefined)
      ?.mountVolume;
    const appStation = new AppStation({
      appId: entry.id,
      appVersion: entry.version,
      runtime,
      idleTimeoutMs: this.idleTimeoutMs,
      resolveMountPath: (open) =>
        resolveMountPath({
          mountVolume,
          permissions: open.effectivePermissions?.permissions,
          volumesBasePath: this.volumesBasePath,
          workspaceId: open.tenant.workspaceId ?? 'default',
        }),
    });

    const [hostSide, ctrlSide] = createInProcessTransportPair();
    appStation.accept(ctrlSide);

    const managed: ManagedApp = {
      entry,
      appStation,
      hostSide,
      initialized: false,
      pending: new Map(),
    };

    hostSide.onMessage((msg: MessageBase) => {
      if (
        msg.type === 'session_opened' &&
        typeof (msg as Record<string, unknown>).sessionId === 'string'
      ) {
        this.sessionIndex.set((msg as Record<string, unknown>).sessionId as string, entry.id);
      }

      if (
        msg.type === 'session_closed' &&
        typeof (msg as Record<string, unknown>).sessionId === 'string'
      ) {
        this.sessionIndex.delete((msg as Record<string, unknown>).sessionId as string);
        this.sessionScopes.delete((msg as Record<string, unknown>).sessionId as string);
      }

      if (SECRET_CALLBACK_TYPES.has(msg.type as string)) {
        void this.handleSecretsCallback(managed, msg as unknown as Record<string, unknown>);
        return;
      }

      if (STORAGE_REQUEST_TYPES.has(msg.type as string)) {
        void this.handleStorageCallback(managed, msg as unknown as Record<string, unknown>);
        return;
      }

      if (VOLUME_REQUEST_TYPES.has(msg.type as string)) {
        void this.handleVolumeRequest(managed, msg as unknown as Record<string, unknown>);
        return;
      }

      if (OBJECT_REQUEST_TYPES.has(msg.type as string)) {
        void this.handleObjectCallback(managed, msg as unknown as Record<string, unknown>);
        return;
      }

      const req = managed.pending.get(msg.id as string);
      if (req) {
        clearTimeout(req.timer);
        managed.pending.delete(msg.id as string);
        req.resolve(msg);
      }
    });

    this.managedApps.set(entry.id, managed);
  }

  async removeApp(appId: string): Promise<void> {
    const managed = this.managedApps.get(appId);
    if (!managed) return;

    for (const [sid, id] of this.sessionIndex) {
      if (id === appId) this.sessionIndex.delete(sid);
    }

    for (const { timer } of managed.pending.values()) clearTimeout(timer);
    managed.pending.clear();

    await managed.appStation.shutdown();
    await managed.hostSide.close();
    this.managedApps.delete(appId);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(port?: number, host?: string): Promise<ServerInfo> {
    const p = port ?? this.defaultPort;
    const h = host ?? this.defaultHost;

    await Promise.allSettled([...this.managedApps.values()].map((m) => this.autoInitialize(m)));

    this.httpServer = createServer((req, res) => {
      this.handleRequest(req, res).catch(() => {
        if (!res.headersSent) json(res, 500, { error: 'Internal server error' });
      });
    });

    const info = await new Promise<ServerInfo>((resolve, reject) => {
      this.httpServer?.listen(p, h, () => {
        const addr = this.httpServer?.address() as { port: number };
        const localUrl = `http://${h === '0.0.0.0' ? 'localhost' : h}:${addr.port}`;
        this._info = {
          port: addr.port,
          host: h,
          url: localUrl,
          stationId: this.stationId,
          apps: [...this.managedApps.keys()],
          oauthCallbackUrl: this.getOAuthRedirectUri(),
        };
        resolve(this._info);
      });
      this.httpServer?.on('error', reject);
    });

    // Announce to stations (fire-and-forget)
    if (this.stations.length > 0) {
      this.announceToStations().catch(() => {});
    }

    return info;
  }

  async stop(): Promise<void> {
    await Promise.allSettled(
      [...this.managedApps.values()].map(async (m) => {
        for (const { timer } of m.pending.values()) clearTimeout(timer);
        m.pending.clear();
        await m.appStation.shutdown();
        await m.hostSide.close();
      }),
    );
    this.managedApps.clear();
    this.sessionIndex.clear();
    this.oauth.dispose();

    if (this.httpServer) {
      await new Promise<void>((r) => this.httpServer?.close(() => r()));
      this.httpServer = null;
    }
    this._info = null;
  }

  get info(): ServerInfo | null {
    return this._info;
  }

  get appIds(): string[] {
    return [...this.managedApps.keys()];
  }

  // -------------------------------------------------------------------------
  // Transport helpers
  // -------------------------------------------------------------------------

  private sendAndWait(
    managed: ManagedApp,
    message: MessageBase,
    timeoutMs = 30_000,
  ): Promise<MessageBase> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        managed.pending.delete(message.id as string);
        reject(new Error(`Timeout after ${timeoutMs}ms waiting for ${message.type} response`));
      }, timeoutMs);

      managed.pending.set(message.id as string, { resolve, timer });
      managed.hostSide.send(message);
    });
  }

  private async autoInitialize(managed: ManagedApp): Promise<void> {
    if (managed.initialized) return;
    const msg: MessageBase = {
      id: `auto-init-${++idCounter}`,
      type: 'initialize',
      timestamp: new Date().toISOString(),
      version: '2.0',
      supportedVersions: ['2.0'],
      host: { name: 'station-server', version: SERVER_VERSION },
      // HOSTCAP-REQ-1: the server answers these Requests itself and serves many users.
      capabilities: {
        directConnection: false,
        multiUser: true,
        push: true,
        storage: true,
        objects: true,
        volume: true,
      },
    } as MessageBase;
    const resp = await this.sendAndWait(managed, msg, 10_000);
    managed.initialized = resp.type === 'initialized';
  }

  /**
   * Answer an instance→host secret request using the configured SecretsManager.
   *
   * Replies mirror the AgentAppHost wire format: `system_secrets` /
   * `installation_secrets` / `update_installation_secrets_response` on success, and a
   * `prompt_result` with `success: false` on failure — so the app's
   * `ctx.systemSecret()` / `ctx.installationSecret()` resolve instead of timing out.
   */
  private async handleSecretsCallback(
    managed: ManagedApp,
    msg: Record<string, unknown>,
  ): Promise<void> {
    const sessionId = msg.sessionId as string;
    const requestId = msg.requestId as string;

    const reply = (type: string, fields: Record<string, unknown>): void => {
      managed.hostSide.send({
        id: `secrets-${++idCounter}`,
        type,
        timestamp: new Date().toISOString(),
        version: '2.0',
        sessionId,
        requestId,
        ...fields,
      } as unknown as MessageBase);
    };

    const fail = (error: string): void => {
      reply('prompt_result', { success: false, error });
    };

    if (!this.secrets) {
      fail(`No secrets manager configured on this server (${msg.type as string})`);
      return;
    }

    const installationId = (msg.installationId as string) ?? managed.entry.id;

    const ctx = {
      installationId,
      tenant: { userId: 'station-server', workspaceId: 'local' },
      sessionId,
    };

    try {
      switch (msg.type) {
        case 'get_system_secrets': {
          const secrets = await this.secrets.getSystemSecrets(ctx);
          reply('system_secrets', { secrets });
          return;
        }
        case 'get_installation_secrets': {
          const secrets = await this.secrets.getInstallationSecrets(ctx);
          reply('installation_secrets', { secrets });
          return;
        }
        case 'update_installation_secrets': {
          const handler = this.secrets.updateInstallationSecrets?.bind(this.secrets);
          if (!handler) {
            fail('Secrets manager does not support updates');
            return;
          }
          const success = await handler(ctx, msg.secrets as Record<string, string>);
          reply('update_installation_secrets_response', { success });
          return;
        }
      }
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }

  private resolveApp(message: Record<string, unknown>): ManagedApp | undefined {
    if (typeof message.installationId === 'string') {
      const m = this.managedApps.get(message.installationId);
      if (m) return m;
    }

    if (typeof message.sessionId === 'string') {
      const appId = this.sessionIndex.get(message.sessionId);
      if (appId) return this.managedApps.get(appId);
    }

    if (typeof message.appId === 'string') {
      const m = this.managedApps.get(message.appId);
      if (m) return m;
    }

    return this.managedApps.values().next().value;
  }

  // -------------------------------------------------------------------------
  // Storage requests (in-memory, for standalone/dev mode)
  // -------------------------------------------------------------------------

  /**
   * Answer an instance→host Storage request with the in-memory document store,
   * scoped by installationId.
   */
  private async handleStorageCallback(
    managed: ManagedApp,
    msg: Record<string, unknown>,
  ): Promise<void> {
    const sessionId = msg.sessionId as string;
    const requestId = msg.requestId as string;
    const installationId =
      this.sessionScopes.get(sessionId)?.installationId ??
      (msg.installationId as string) ??
      managed.entry.id;

    const reply = (type: string, fields: Record<string, unknown>): void => {
      managed.hostSide.send({
        id: `storage-${++idCounter}`,
        type,
        timestamp: new Date().toISOString(),
        version: '2.0',
        sessionId,
        requestId,
        ...fields,
      } as unknown as MessageBase);
    };

    try {
      const response = await handleStorageRequest(inMemoryStorage, installationId, msg);
      reply(response.type, response.fields);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Storage error';
      reply(`${msg.type as string}_response`, { success: false, error });
    }
  }

  // -------------------------------------------------------------------------
  // Volume storage requests (file_volume_*)
  // -------------------------------------------------------------------------

  /**
   * Answer an instance→host volume storage request.
   *
   * Resolves the workspaceId + installationId from the message (or falls
   * back to the managed app's id), then delegates to the volume handlers
   * which operate on the physical `workspace/` directory.
   */
  private async handleVolumeRequest(
    managed: ManagedApp,
    msg: Record<string, unknown>,
  ): Promise<void> {
    const sessionId = msg.sessionId as string;
    const requestId = msg.requestId as string;
    // VOL-REQ-1 / VOL-REQ-2: the Workspace and the Effective Permissions come
    // from the session_open this server relayed.
    const scope = this.sessionScopes.get(sessionId);
    const ctx: VolumeHandlerContext = {
      volumesBasePath: this.volumesBasePath,
      workspaceId: scope?.workspaceId ?? 'default',
      sessionId,
      permissions: scope?.permissions,
    };

    try {
      const response = await handleVolumeRequest(ctx, msg);
      if (response) {
        managed.hostSide.send(response as unknown as MessageBase);
      } else {
        // Unknown request type — send error result
        managed.hostSide.send({
          id: `vol-err-${++idCounter}`,
          type: `${msg.type as string}_result`,
          timestamp: new Date().toISOString(),
          version: '2.0',
          sessionId,
          requestId,
          success: false,
          error: `Unknown volume request: ${msg.type as string}`,
        } as unknown as MessageBase);
      }
    } catch (err) {
      managed.hostSide.send({
        id: `vol-err-${++idCounter}`,
        type: `${msg.type as string}_result`,
        timestamp: new Date().toISOString(),
        version: '2.0',
        sessionId,
        requestId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      } as unknown as MessageBase);
    }
  }

  // -------------------------------------------------------------------------
  // Object Requests (object_put, object_get, object_delete, object_list, object_link)
  // -------------------------------------------------------------------------

  /** The object store, built lazily once the server knows its URL. */
  private objects(): ObjectStore {
    if (!this.objectStore) {
      this.objectStore = new ObjectStore({
        volumesBasePath: this.volumesBasePath,
        stationSecret: this.stationSecret,
        publicUrl: this.publicUrl ?? this._info?.url ?? `http://localhost:${this.defaultPort}`,
      });
    }
    return this.objectStore;
  }

  /**
   * Answer an instance→host object Request. The Installation and Workspace
   * come from the session that was opened over `/messages`; a session the
   * server did not open itself falls back to the app id and `default`.
   */
  private async handleObjectCallback(
    managed: ManagedApp,
    msg: Record<string, unknown>,
  ): Promise<void> {
    const sessionId = msg.sessionId as string;
    const requestId = msg.requestId as string;
    const scope = this.sessionScopes.get(sessionId) ?? {
      installationId: managed.entry.id,
      workspaceId: 'default',
    };
    try {
      const response = await handleObjectRequest(this.objects(), scope, msg);
      managed.hostSide.send(
        (response ?? {
          id: `obj-err-${++idCounter}`,
          type: 'prompt_result',
          timestamp: new Date().toISOString(),
          version: '2.0',
          sessionId,
          requestId,
          success: false,
          error: `Unknown object request: ${msg.type as string}`,
        }) as unknown as MessageBase,
      );
    } catch (err) {
      managed.hostSide.send({
        id: `obj-err-${++idCounter}`,
        type: 'prompt_result',
        timestamp: new Date().toISOString(),
        version: '2.0',
        sessionId,
        requestId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      } as unknown as MessageBase);
    }
  }

  // -------------------------------------------------------------------------
  // Station announce
  // -------------------------------------------------------------------------

  /**
   * Announce all apps to registered stations.
   *
   * Opens a temporary session per app to discover its tools, then POSTs
   * the catalog to each station's announce endpoint. Stations use this
   * to register the app station and its apps automatically.
   */
  async announceToStations(): Promise<void> {
    if (this.stations.length === 0) return;

    const apps = await this.buildAnnounceCatalog();
    if (apps.length === 0) return;

    const stationUrl = this._info?.url;
    if (!stationUrl) return;

    const payload = {
      stationId: this.stationId,
      stationUrl,
      apps,
    };

    await Promise.allSettled(this.stations.map((station) => this.postAnnounce(station, payload)));
  }

  private async buildAnnounceCatalog(): Promise<
    Array<{
      appId: string;
      name: string;
      version: string;
      description?: string;
      tools: Array<{
        name: string;
        description: string;
        parameters?: unknown;
        annotations?: unknown;
      }>;
    }>
  > {
    const result: Array<{
      appId: string;
      name: string;
      version: string;
      description?: string;
      tools: Array<{
        name: string;
        description: string;
        parameters?: unknown;
        annotations?: unknown;
      }>;
    }> = [];

    for (const [appId, managed] of this.managedApps) {
      try {
        if (!managed.initialized) await this.autoInitialize(managed);

        // Open temporary session to list tools
        const openMsg: MessageBase = {
          id: `announce-open-${++idCounter}`,
          type: 'session_open',
          timestamp: new Date().toISOString(),
          version: '2.0',
          installationId: appId,
          tenant: { userId: 'system', workspaceId: 'system' },
        } as MessageBase;

        const openResp = await this.sendAndWait(managed, openMsg, 10_000);
        if (openResp.type !== 'session_opened') continue;

        const sessionId = (openResp as Record<string, unknown>).sessionId as string;

        // List tools
        const toolsMsg: MessageBase = {
          id: `announce-tools-${++idCounter}`,
          type: 'list_tools',
          timestamp: new Date().toISOString(),
          version: '2.0',
          sessionId,
        } as MessageBase;

        const toolsResp = await this.sendAndWait(managed, toolsMsg, 10_000);
        const tools =
          ((toolsResp as Record<string, unknown>).tools as Array<Record<string, unknown>>) ?? [];

        // Close temporary session (best-effort)
        const closeMsg: MessageBase = {
          id: `announce-close-${++idCounter}`,
          type: 'session_close',
          timestamp: new Date().toISOString(),
          version: '2.0',
          sessionId,
          reason: 'announce-complete',
        } as MessageBase;
        this.sendAndWait(managed, closeMsg, 5_000).catch(() => {});

        // Cache tool annotations for permission enforcement
        this.cacheTools(
          appId,
          tools.map((t) => ({
            name: t.name as string,
            annotations: t.annotations as Record<string, unknown> | undefined,
          })),
        );

        result.push({
          appId,
          name: managed.entry.name ?? appId.replace(/^app\./, ''),
          version: managed.entry.version,
          description: managed.entry.description,
          tools: tools.map((t) => ({
            name: t.name as string,
            description: t.description as string,
            parameters: t.parameters,
            annotations: t.annotations,
          })),
        });
      } catch {
        // Skip apps that fail to list tools
      }
    }

    return result;
  }

  private async postAnnounce(station: StationEndpoint, payload: unknown): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (station.token) headers.Authorization = `Bearer ${station.token}`;

    const response = await fetch(station.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Station ${station.url} responded ${response.status}: ${body}`);
    }
  }

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Authentication: API keys or legacy bearer token.
    const authResult = await this.authenticateRequest(req, url);
    if (authResult === false) {
      json(res, 401, { error: 'Unauthorized' });
      return;
    }

    if (url === '/health' && req.method === 'GET') {
      json(res, 200, {
        status: 'ok',
        stationId: this.stationId,
        version: SERVER_VERSION,
        apps: [...this.managedApps.entries()].map(([id, m]) => ({
          id,
          version: m.entry.version,
          name: m.entry.name,
          initialized: m.initialized,
          sessions: m.appStation.sessionCount,
          instances: m.appStation.instanceCount,
        })),
      });
      return;
    }

    if (url === '/messages' && req.method === 'POST') {
      await this.handleMessages(req, res, authResult || undefined);
      return;
    }

    // OAuth routes — start and callback
    if (req.method === 'GET' && url.startsWith('/auth/start')) {
      await this.handleAuthStart(req, res);
      return;
    }

    if (req.method === 'GET' && url.startsWith('/auth/callback')) {
      await this.handleAuthCallback(req, res);
      return;
    }

    if (req.method === 'GET' && url.startsWith('/auth/status')) {
      await this.handleAuthStatus(req, res);
      return;
    }

    // @spec HOOK-REQ-26
    const adminRoute = req.method === 'POST' ? this.adminRoutes[url] : undefined;
    if (adminRoute) {
      if (((authResult || undefined)?.principalId ?? ADMIN_PRINCIPAL_ID) !== ADMIN_PRINCIPAL_ID) {
        json(res, 403, { error: 'Only the admin may call this route' });
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse((await readBody(req)) || '{}');
      } catch {
        json(res, 400, { error: 'Body is not JSON' });
        return;
      }
      json(res, 200, (await adminRoute(body)) ?? {});
      return;
    }

    // Management API (permissions, keys, approvals)
    // @spec POLICY-REQ-7
    if (url === '/approvals' || url.startsWith('/approvals/')) {
      await this.handleApprovals(req, res, url, authResult || undefined);
      return;
    }

    if (this.enableManagementApi && url.startsWith('/api/')) {
      await this.handleManagementApi(req, res, url, authResult || undefined);
      return;
    }

    // App discovery & static serving routes
    if (req.method === 'GET' && (url === '/apps' || url === '/apps/')) {
      this.handleAppCatalog(res);
      return;
    }

    const manifestMatch = url.match(/^\/apps\/([^/]+)\/manifest$/);
    if (req.method === 'GET' && manifestMatch) {
      this.handleAppManifest(res, manifestMatch[1]);
      return;
    }

    if (req.method === 'GET' && (url === '/launcher' || url === '/launcher/')) {
      this.handleLauncher(res, req);
      return;
    }

    const bundleMatch = url.match(/^\/apps\/([^/]+)\/bundles\/(.+)$/);
    if (req.method === 'GET' && bundleMatch) {
      this.handleStaticBundle(res, bundleMatch[1], bundleMatch[2]);
      return;
    }

    // Objects: public ones to anyone, private ones with a signed link token
    const objectMatch = url.match(/^\/objects\/([^?/]+)(?:\?(.*))?$/);
    if (objectMatch && req.method === 'GET') {
      const token = new URLSearchParams(objectMatch[2] ?? '').get('token') ?? undefined;
      await this.handleObjectRequest(res, objectMatch[1], token);
      return;
    }

    json(res, 404, { error: `Not found: ${req.method} ${url}` });
  }

  // -------------------------------------------------------------------------
  // OAuth helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve the OAuth redirect URI for the app station.
   *
   * Priority: explicit `publicUrl` option → auto-detect from request headers
   * (supports X-Forwarded-Proto/Host behind a reverse proxy) → fallback to
   * the server's own info.
   */
  private getOAuthRedirectUri(req?: IncomingMessage): string {
    if (this.publicUrl) {
      const base = this.publicUrl.replace(/\/+$/, '');
      return `${base}/auth/callback`;
    }

    if (req) {
      const proto = req.headers['x-forwarded-proto'] ?? 'http';
      const host = req.headers['x-forwarded-host'] ?? req.headers.host;
      if (host) return `${proto}://${host}/auth/callback`;
    }

    const port = this._info?.port ?? this.defaultPort;
    return `http://localhost:${port}/auth/callback`;
  }

  // -------------------------------------------------------------------------
  // OAuth handlers
  // -------------------------------------------------------------------------

  /**
   * GET /auth/start?installationId=X[&userId=Z&workspaceId=W]
   *
   * Initiates an OAuth flow. Resolves the installationId to an appId, reads
   * the app's auth config and system secrets, builds the authorize URL, and
   * either redirects the browser (302) or returns JSON with the URL.
   */
  private async handleAuthStart(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsed = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const installationId = parsed.searchParams.get('installationId');
    const userId = parsed.searchParams.get('userId') ?? 'anonymous';
    const workspaceId = parsed.searchParams.get('workspaceId') ?? 'local';

    if (!installationId) {
      json(res, 400, { error: 'Missing required query parameter: installationId' });
      return;
    }

    // Resolve installationId → appId
    if (!this.resolveInstallation) {
      json(res, 500, {
        error: 'No installation resolver configured — cannot map installationId to app',
      });
      return;
    }
    const resolved = this.resolveInstallation(installationId);
    if (!resolved) {
      json(res, 404, { error: `Unknown installationId: ${installationId}` });
      return;
    }
    const { appId } = resolved;

    const managed = this.managedApps.get(appId);
    if (!managed) {
      json(res, 404, { error: `App not found: ${appId}` });
      return;
    }

    const authConfig = managed.entry.auth;
    if (!authConfig?.authorizeUrl || !authConfig?.tokenUrl) {
      json(res, 400, { error: `App ${appId} does not support OAuth (missing auth config)` });
      return;
    }

    // Resolve system secrets for client credentials
    if (!this.secrets) {
      json(res, 500, { error: 'No secrets manager configured — cannot read OAuth credentials' });
      return;
    }

    const ctx = {
      installationId,
      tenant: { userId, workspaceId },
    };

    let systemSecrets: Record<string, string>;
    try {
      systemSecrets = (await this.secrets.getSystemSecrets(ctx)) ?? {};
    } catch {
      json(res, 500, { error: 'Failed to read system secrets' });
      return;
    }

    const clientId = systemSecrets.CLIENT_ID;
    const clientSecret = systemSecrets.CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      json(res, 500, { error: `Missing CLIENT_ID or CLIENT_SECRET for ${appId}` });
      return;
    }

    // Build the request URI from the app station's public URL — this is
    // infrastructure-level, not per-app. All OAuth apps share the same
    // request endpoint.
    const redirectUri = this.getOAuthRedirectUri(req);

    const params: OAuthStartParams = {
      installationId,
      appId,
      tenant: { userId, workspaceId },
      provider: authConfig.provider ?? 'oauth2',
      authorizeUrl: authConfig.authorizeUrl,
      tokenUrl: authConfig.tokenUrl,
      clientId,
      clientSecret,
      redirectUri,
      scopes: authConfig.scopes,
    };

    const { url, state } = this.oauth.startAuth(params);

    // If the browser wants HTML, redirect directly. Otherwise return JSON.
    const accept = req.headers.accept ?? '';
    if (accept.includes('text/html')) {
      res.writeHead(302, { Location: url });
      res.end();
    } else {
      json(res, 200, { url, state });
    }
  }

  /**
   * GET /auth/callback?code=X&state=Y
   *
   * Receives the OAuth provider's redirect. Exchanges the code for tokens,
   * persists them via the SecretsManager, and shows a success/error page.
   */
  private async handleAuthCallback(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsed = new URL(_req.url ?? '/', `http://${_req.headers.host ?? 'localhost'}`);
    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');
    const providerError = parsed.searchParams.get('error');
    const errorDescription = parsed.searchParams.get('error_description');

    const html = (status: number, body: string): void => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body);
    };

    // Provider returned an error (e.g. user denied consent)
    if (providerError) {
      html(400, errorPage('Authentication denied', errorDescription ?? providerError));
      return;
    }

    if (!code || !state) {
      html(400, errorPage('Missing parameters', 'The request is missing code or state.'));
      return;
    }

    if (!this.oauth.hasPending(state)) {
      html(
        400,
        errorPage('Session expired', 'This authentication link has expired. Please start again.'),
      );
      return;
    }

    try {
      const result = await this.oauth.handleCallback(state, code);

      // Persist tokens via the SecretsManager
      if (this.secrets?.updateInstallationSecrets) {
        const ctx = {
          installationId: result.installationId,
          tenant: result.tenant ?? { userId: 'anonymous', workspaceId: 'local' },
        };
        await this.secrets.updateInstallationSecrets(
          ctx,
          result.tokens as unknown as Record<string, string>,
        );
      }

      const appName = this.managedApps.get(result.appId)?.entry.name ?? result.installationId;
      html(200, successPage(appName));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      html(500, errorPage('Authentication failed', message));
    }
  }

  /**
   * GET /auth/status?installationId=X
   *
   * Returns the current authentication status for an installation.
   * Used by the CLI to poll for completion after delegating OAuth
   * to the station via /auth/start.
   */
  private async handleAuthStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsed = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const installationId = parsed.searchParams.get('installationId');

    if (!installationId) {
      json(res, 400, { error: 'Missing required query parameter: installationId' });
      return;
    }

    if (!this.secrets) {
      json(res, 500, { error: 'No secrets manager configured' });
      return;
    }

    const ctx = {
      installationId,
      tenant: { userId: 'anonymous', workspaceId: 'local' },
    };

    try {
      const installationSecrets = (await this.secrets.getInstallationSecrets(ctx)) ?? {};
      const authenticated = !!(
        installationSecrets.ACCESS_TOKEN || installationSecrets.REFRESH_TOKEN
      );
      json(res, 200, { authenticated });
    } catch {
      json(res, 500, { error: 'Failed to read auth status' });
    }
  }

  // -------------------------------------------------------------------------
  // Messages handler
  // -------------------------------------------------------------------------

  private async handleMessages(
    req: IncomingMessage,
    res: ServerResponse,
    authResult?: { identity?: ApiKeyIdentity; principalId: string },
  ): Promise<void> {
    let body: string;
    try {
      body = await readBody(req);
    } catch {
      json(res, 400, { error: 'Failed to read request body' });
      return;
    }

    let message: MessageBase;
    try {
      message = JSON.parse(body) as MessageBase;
    } catch {
      json(res, 400, { error: 'Invalid JSON' });
      return;
    }

    const managed = this.resolveApp(message as Record<string, unknown>);
    if (!managed) {
      json(res, 404, { error: 'No matching app found' });
      return;
    }

    if (!managed.initialized && message.type !== 'initialize') {
      try {
        await this.autoInitialize(managed);
      } catch {
        // AppStation will reject with "not initialized"
      }
    }

    // POLICY-REQ-5: evaluate the Principal's Policy before relaying a tool call.
    // An open station (no credential configured) serves only its local admin.
    if (message.type === 'tool_call' && this.policyStore) {
      const msg = message as MessageBase & { tool?: string; arguments?: Record<string, unknown> };
      const toolName = msg.tool ?? '';
      const args = msg.arguments ?? {};
      const principalId = authResult?.principalId ?? ADMIN_PRINCIPAL_ID;
      const policy = await policyFor(this.policyStore, principalId);
      const decision = evaluatePolicy(policy, {
        app: managed.entry.id,
        tool: toolName,
        args,
        annotations: this.getToolAnnotations(managed.entry.id, toolName),
      });

      let outcome: 'allow' | 'deny' | 'timeout' = decision.effect === 'deny' ? 'deny' : 'allow';
      if (decision.effect === 'ask' && this.approvalManager) {
        // POLICY-REQ-6: park until the Approver decides or the Approval expires.
        const answer = await this.approvalManager.park({
          principalId,
          app: managed.entry.id,
          tool: toolName,
          args,
          rule: decision.rule,
        });
        outcome = answer === 'approve' ? 'allow' : answer;
      }

      if (outcome !== 'allow') {
        const reason =
          outcome === 'timeout'
            ? `Tool '${toolName}' was not approved before the Approval expired`
            : `Tool '${toolName}' is denied by rule '${decision.rule}' of ${principalId}'s Policy`;
        // POLICY-NFR-1: every deny is audited.
        // eslint-disable-next-line no-console
        console.error(
          `[policy] ${outcome}: principal=${principalId} app=${managed.entry.id} tool=${toolName} rule=${decision.rule} at=${new Date().toISOString()}`,
        );
        json(res, 403, {
          id: message.id,
          type: 'error',
          timestamp: new Date().toISOString(),
          version: '2.0',
          error: {
            code: outcome === 'timeout' ? ErrorCode.APPROVAL_TIMEOUT : ErrorCode.PERMISSION_DENIED,
            message: reason,
            details: { layer: 'policy', rule: decision.rule, reason },
          },
        });
        return;
      }
    }

    try {
      const response = await this.sendAndWait(managed, message);
      if (message.type === 'session_open' && response.type === 'session_opened') {
        const open = message as Record<string, unknown>;
        const tenant = open.tenant as { workspaceId?: string } | undefined;
        this.sessionScopes.set((response as Record<string, unknown>).sessionId as string, {
          installationId: (open.installationId as string) ?? managed.entry.id,
          workspaceId: tenant?.workspaceId ?? 'default',
          permissions: (open.effectivePermissions as { permissions?: { volume?: boolean } })
            ?.permissions,
        });
      }
      // POLICY-REQ-4: Rules on Annotations need the tools' Annotations.
      if (message.type === 'list_tools') {
        const tools = (response as Record<string, unknown>).tools as
          | Array<{ name: string; annotations?: Record<string, unknown> }>
          | undefined;
        if (tools) this.cacheTools(managed.entry.id, tools);
      }
      json(res, 200, response);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      json(res, 504, { error: errMsg });
    }
  }

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  /**
   * Authenticate an incoming request.
   *
   * Returns:
   * - `null` when no auth is configured (pass-through)
   * - `false` when auth is required but the request is invalid
   * - `{ identity, policyId }` on success
   */
  private async authenticateRequest(req: IncomingMessage, url: string): Promise<AuthResult> {
    const needsAuth =
      url.startsWith('/messages') ||
      url.startsWith('/api/') ||
      url.startsWith('/approvals') ||
      url in this.adminRoutes;
    if (!needsAuth) return null;

    // Auth is enforced once a legacy token is configured or at least one
    // active API key exists. An empty (or fully revoked/expired) key store
    // keeps the station open — creating the first key switches auth on.
    if (!this.token) {
      if (!this.apiKeyStore) return null;
      const keys = await this.apiKeyStore.list();
      const now = new Date();
      const hasActiveKey = keys.some(
        (k) => !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt) > now),
      );
      if (!hasActiveKey) return null;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) return false;

    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!bearer) return false;

    // API key auth (aak_ prefix)
    if (this.apiKeyStore && bearer.startsWith('aak_')) {
      const hash = hashApiKey(bearer);
      const record = await this.apiKeyStore.getByHash(hash);
      if (!record) return false;
      return { identity: record.identity, principalId: record.principalId };
    }

    // Legacy single-token auth
    if (this.token && bearer === this.token) {
      return { identity: { userId: 'local' }, principalId: ADMIN_PRINCIPAL_ID };
    }

    // The local admin credential handed to the CLI that launched the station.
    if (this.adminToken && bearer === this.adminToken) {
      return { identity: { userId: ADMIN_PRINCIPAL_ID }, principalId: ADMIN_PRINCIPAL_ID };
    }

    return false;
  }

  // -------------------------------------------------------------------------
  // Tool annotations cache
  // -------------------------------------------------------------------------

  /** Look up cached tool annotations for permission enforcement. */
  private getToolAnnotations(appId: string, toolName: string): Record<string, unknown> | undefined {
    const tools = this.toolsCache.get(appId);
    if (!tools) return undefined;
    const tool = tools.find((t) => t.name === toolName);
    return tool?.annotations;
  }

  /** Populate tool cache for an app (called after auto-init or announce). */
  private cacheTools(
    appId: string,
    tools: Array<{ name: string; annotations?: Record<string, unknown> }>,
  ): void {
    this.toolsCache.set(appId, tools);
  }

  // -------------------------------------------------------------------------
  // App discovery & static serving
  // -------------------------------------------------------------------------

  /**
   * GET /apps — JSON catalog of all registered apps.
   *
   * Returns a lightweight listing (id, version, name, description) suitable
   * for registries and launchers to discover what's running on this station.
   */
  private handleAppCatalog(res: ServerResponse): void {
    const apps = [...this.managedApps.entries()].map(([id, m]) => ({
      id,
      version: m.entry.version,
      name: m.entry.name ?? id,
      description: m.entry.description,
      manifestUrl: `/apps/${id}/manifest`,
      ...(m.entry.sourcePath ? { bundlesUrl: `/apps/${id}/bundles` } : {}),
    }));

    json(res, 200, {
      stationId: this.stationId,
      apps,
    });
  }

  /**
   * GET /apps/:appId/manifest — full manifest JSON for an app.
   *
   * Serves the `agentapp.json` content (or the manifest passed via `AppEntry.manifest`).
   * Returns 404 if the app is not registered, and 404 with a helpful message
   * if the app was registered without a manifest.
   */
  private handleAppManifest(res: ServerResponse, appId: string): void {
    const managed = this.managedApps.get(appId);
    if (!managed) {
      json(res, 404, { error: `App not found: ${appId}` });
      return;
    }

    if (!managed.entry.manifest) {
      json(res, 404, { error: `No manifest available for app: ${appId}` });
      return;
    }

    json(res, 200, managed.entry.manifest);
  }

  /**
   * GET /launcher — generic HTML launcher page.
   *
   * Renders an HTML page that reads each app's manifest, evaluates screen
   * conditions, and auto-opens the first eligible screen in an iframe.
   *
   * The page embeds manifest data as JSON so client-side JS can:
   * - Evaluate `condition` predicates on screens (e.g. 'authenticated', '!authenticated')
   * - Show/hide screens based on the current auth state
   * - Auto-open the first visible launcher screen
   * - Navigate between screens without a full page reload
   *
   * Screens without a `bundleUrl` are listed but not openable in the iframe.
   */
  private handleLauncher(res: ServerResponse, req: IncomingMessage): void {
    const baseUrl = this.getBaseUrl(req);

    // Build a serializable catalog: one entry per app with its launcher screens
    const catalog = [...this.managedApps.values()].map((m) => {
      const manifest = m.entry.manifest;
      const appId = m.entry.id;
      const name = m.entry.name ?? appId;
      const description = m.entry.description ?? '';

      const screens = (manifest?.screens as Array<Record<string, unknown>> | undefined) ?? [];
      const launcherScreens = screens
        .filter((s) => s.launcher === true)
        .map((s) => {
          const bundleUrl = s.bundleUrl as string | undefined;
          const resolvedUrl = bundleUrl ? resolveBundleLink(bundleUrl, appId, baseUrl) : null;

          return {
            name: String(s.name ?? ''),
            title: String(s.title ?? s.name ?? ''),
            description: s.description != null ? String(s.description) : undefined,
            icon: s.icon != null ? String(s.icon) : undefined,
            condition: s.condition != null ? String(s.condition) : undefined,
            bundleUrl: resolvedUrl,
            manifestUrl: `${baseUrl}/apps/${encodeURIComponent(appId)}/manifest`,
          };
        });

      return {
        id: appId,
        name,
        description,
        manifestUrl: `${baseUrl}/apps/${encodeURIComponent(appId)}/manifest`,
        screens: launcherScreens,
      };
    });

    // Pre-render the app cards for no-JS fallback and SEO
    const cardsHtml =
      catalog.length > 0
        ? catalog
            .map((app) => {
              if (app.screens.length === 0) {
                return `      <div class="app-card" data-app-id="${escapeHtml(app.id)}">
        <h3>${escapeHtml(app.name)}</h3>
        <p class="desc">${escapeHtml(app.description)}</p>
        <a href="${escapeHtml(app.manifestUrl)}" class="btn">Manifest</a>
      </div>`;
              }

              const screenButtons = app.screens
                .map((s) => {
                  const condAttr = s.condition
                    ? ` data-condition="${escapeHtml(s.condition)}"`
                    : '';
                  const urlAttr = s.bundleUrl
                    ? ` data-bundle-url="${escapeHtml(s.bundleUrl)}"`
                    : '';
                  return `        <a href="${s.bundleUrl ?? '#'}" class="btn screen-btn" data-screen="${escapeHtml(s.name)}"${condAttr}${urlAttr}>${escapeHtml(s.title)}</a>`;
                })
                .join('\n');

              return `      <div class="app-card" data-app-id="${escapeHtml(app.id)}">
        <h3>${escapeHtml(app.name)}</h3>
        <p class="desc">${escapeHtml(app.description)}</p>
        <div class="screens">
${screenButtons}
        </div>
        <a href="${escapeHtml(app.manifestUrl)}" class="btn secondary">Manifest</a>
      </div>`;
            })
            .join('\n')
        : '      <p class="empty">No apps registered on this station.</p>';

    const catalogJson = JSON.stringify(catalog).replace(/</g, '\\u003c');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Apps Station — Launcher</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #fafafa;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      padding: 1rem 2rem;
      border-bottom: 1px solid #27272a;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .header h1 { font-size: 1.3rem; }
    .subtitle { color: #a1a1aa; font-size: 0.8rem; }
    .toolbar { display: flex; align-items: center; gap: 0.75rem; }
    .auth-toggle {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8rem;
      color: #a1a1aa;
      cursor: pointer;
      user-select: none;
    }
    .auth-toggle input { cursor: pointer; }
    .main {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .sidebar {
      width: 320px;
      min-width: 280px;
      max-width: 400px;
      border-right: 1px solid #27272a;
      padding: 1.5rem;
      overflow-y: auto;
    }
    .sidebar h2 { font-size: 0.9rem; color: #a1a1aa; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .grid {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .app-card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 1.25rem;
    }
    .app-card h3 { font-size: 1.1rem; margin-bottom: 0.5rem; }
    .desc { color: #a1a1aa; font-size: 0.85rem; margin-bottom: 1rem; line-height: 1.4; }
    .screens { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; }
    .btn {
      display: inline-block;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      text-decoration: none;
      transition: background 0.15s, opacity 0.15s;
      cursor: pointer;
      border: none;
    }
    .btn:link, .btn:visited { color: #fafafa; }
    .btn { background: #5e6ad2; }
    .btn:hover { background: #4f5ab8; }
    .btn.secondary { background: #27272a; }
    .btn.secondary:hover { background: #3f3f46; }
    .btn.screen-btn { width: 100%; text-align: center; }
    .btn.screen-btn.active { background: #4f5ab8; box-shadow: 0 0 0 2px #5e6ad2; }
    .btn.screen-btn.hidden { display: none; }
    .btn.screen-btn.disabled { opacity: 0.4; cursor: default; pointer-events: none; }
    .empty { color: #a1a1aa; font-style: italic; }
    .content {
      flex: 1;
      position: relative;
      background: #18181b;
    }
    .content iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .placeholder {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #52525b;
      font-size: 1rem;
      text-align: center;
      padding: 2rem;
    }
    .placeholder.hidden { display: none; }
    .screen-header {
      padding: 0.75rem 1.5rem;
      border-bottom: 1px solid #27272a;
      font-size: 0.85rem;
      color: #a1a1aa;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .screen-header .screen-title { color: #fafafa; font-weight: 600; }
    .screen-header a { color: #5e6ad2; text-decoration: none; font-size: 0.8rem; }
    .screen-header a:hover { text-decoration: underline; }
    @media (max-width: 768px) {
      .main { flex-direction: column; }
      .sidebar { width: 100%; max-width: none; border-right: none; border-bottom: 1px solid #27272a; max-height: 40vh; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>\u{1F680} Agent Apps Station</h1>
      <p class="subtitle">Station ID: ${escapeHtml(this.stationId)}</p>
    </div>
    <div class="toolbar">
      <label class="auth-toggle">
        <input type="checkbox" id="auth-state" />
        Authenticated
      </label>
    </div>
  </div>
  <div class="main">
    <div class="sidebar">
      <h2>Apps &amp; Screens</h2>
      <div class="grid" id="app-grid">
${cardsHtml}
      </div>
    </div>
    <div class="content">
      <div class="screen-header" id="screen-header" style="display:none;">
        <span class="screen-title" id="screen-title"></span>
        <a href="#" id="screen-manifest-link" target="_blank">View manifest</a>
      </div>
      <div class="placeholder" id="placeholder">
        Select a screen to open it, or the first eligible screen will open automatically.
      </div>
      <iframe id="screen-frame" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style="display:none;"></iframe>
    </div>
  </div>
  <script id="catalog-data" type="application/json">${catalogJson}</script>
  <script>
    (function() {
      var catalog = JSON.parse(document.getElementById('catalog-data').textContent);
      var authCheckbox = document.getElementById('auth-state');
      var screenFrame = document.getElementById('screen-frame');
      var placeholder = document.getElementById('placeholder');
      var screenHeader = document.getElementById('screen-header');
      var screenTitle = document.getElementById('screen-title');
      var screenManifestLink = document.getElementById('screen-manifest-link');
      var currentScreen = null;

      // --- Condition evaluation ---
      // Supports simple predicates: 'authenticated', '!authenticated'
      // Negation is indicated by a leading '!'.
      function evaluateCondition(condition, context) {
        if (!condition) return true;
        var negated = condition.charAt(0) === '!';
        var key = negated ? condition.slice(1) : condition;
        var value = context[key] || false;
        return negated ? !value : value;
      }

      function getAuthContext() {
        return { authenticated: authCheckbox.checked };
      }

      // --- Screen visibility ---
      function updateScreenVisibility() {
        var ctx = getAuthContext();
        var buttons = document.querySelectorAll('.screen-btn');
        for (var i = 0; i < buttons.length; i++) {
          var btn = buttons[i];
          var condition = btn.getAttribute('data-condition');
          var visible = evaluateCondition(condition, ctx);
          if (visible) {
            btn.classList.remove('hidden');
          } else {
            btn.classList.add('hidden');
            btn.classList.remove('active');
          }
        }
        // If the currently displayed screen is now hidden, close it
        if (currentScreen && currentScreen.condition) {
          if (!evaluateCondition(currentScreen.condition, ctx)) {
            closeScreen();
          }
        }
        // Auto-open the first visible screen if nothing is open
        if (!currentScreen) {
          autoOpenFirstScreen();
        }
      }

      // --- Screen opening ---
      function openScreen(app, screen) {
        if (!screen.bundleUrl) return;
        currentScreen = screen;
        screenFrame.src = screen.bundleUrl;
        screenFrame.style.display = 'block';
        placeholder.classList.add('hidden');
        screenHeader.style.display = 'flex';
        screenTitle.textContent = app.name + ' / ' + screen.title;
        screenManifestLink.href = app.manifestUrl;
        // Mark active button
        var buttons = document.querySelectorAll('.screen-btn');
        for (var i = 0; i < buttons.length; i++) {
          buttons[i].classList.remove('active');
        }
        var activeBtn = document.querySelector('.screen-btn[data-screen="' + cssEscape(screen.name) + '"]');
        if (activeBtn) activeBtn.classList.add('active');
      }

      function closeScreen() {
        currentScreen = null;
        screenFrame.src = 'about:blank';
        screenFrame.style.display = 'none';
        placeholder.classList.remove('hidden');
        screenHeader.style.display = 'none';
        var buttons = document.querySelectorAll('.screen-btn');
        for (var i = 0; i < buttons.length; i++) {
          buttons[i].classList.remove('active');
        }
      }

      function autoOpenFirstScreen() {
        var ctx = getAuthContext();
        for (var i = 0; i < catalog.length; i++) {
          var app = catalog[i];
          for (var j = 0; j < app.screens.length; j++) {
            var screen = app.screens[j];
            if (screen.bundleUrl && evaluateCondition(screen.condition, ctx)) {
              openScreen(app, screen);
              return;
            }
          }
        }
      }

      // --- CSS escape for attribute selectors ---
      function cssEscape(str) {
        return str.replace(/["\\\\]/g, '\\\\$&');
      }

      // --- Event wiring ---
      // Click handler for screen buttons
      document.addEventListener('click', function(e) {
        var btn = e.target.closest('.screen-btn');
        if (!btn) return;
        e.preventDefault();
        var screenName = btn.getAttribute('data-screen');
        var bundleUrl = btn.getAttribute('data-bundle-url');
        if (!bundleUrl || bundleUrl === '#') return;
        // Find the screen in the catalog
        for (var i = 0; i < catalog.length; i++) {
          var app = catalog[i];
          for (var j = 0; j < app.screens.length; j++) {
            if (app.screens[j].name === screenName) {
              openScreen(app, app.screens[j]);
              return;
            }
          }
        }
      });

      // Auth state toggle
      authCheckbox.addEventListener('change', updateScreenVisibility);

      // --- Initial render ---
      // Mark buttons without bundleUrl as disabled
      var buttons = document.querySelectorAll('.screen-btn');
      for (var i = 0; i < buttons.length; i++) {
        var url = buttons[i].getAttribute('data-bundle-url');
        if (!url || url === '#') {
          buttons[i].classList.add('disabled');
        }
      }
      updateScreenVisibility();
    })();
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }

  /**
   * GET /apps/:appId/bundles/* — serve static files from the app's source directory.
   *
   * The path after `/bundles/` is resolved relative to the app's `sourcePath`.
   * Path traversal is prevented by normalizing and checking the resolved path
   * stays within the source directory.
   */
  private handleStaticBundle(res: ServerResponse, appId: string, relativePath: string): void {
    const managed = this.managedApps.get(appId);
    if (!managed) {
      json(res, 404, { error: `App not found: ${appId}` });
      return;
    }

    const sourcePath = managed.entry.sourcePath;
    if (!sourcePath) {
      json(res, 404, { error: `No source path configured for app: ${appId}` });
      return;
    }

    // Decode URL-encoded path and normalize
    const decoded = decodeURIComponent(relativePath);
    const safePath = this.resolveSafePath(sourcePath, decoded);
    if (!safePath) {
      json(res, 403, { error: 'Path traversal denied' });
      return;
    }

    if (!existsSync(safePath) || !statSync(safePath).isFile()) {
      json(res, 404, { error: `File not found: ${decoded}` });
      return;
    }

    const mimeType = getMimeType(safePath);
    const stat = statSync(safePath);

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });

    createReadStream(safePath).pipe(res);
  }

  /**
   * GET /objects/{id}[?token=…]
   *
   * - Public object → 200, permanent.
   * - Private object with a valid signed link token for that id → 200.
   * - Private object without a valid token → 401.
   * - Unknown id → 404.
   * Cache-Control: no-cache, so an expired link is not served from a cache.
   */
  private async handleObjectRequest(
    res: ServerResponse,
    objectId: string,
    token?: string,
  ): Promise<void> {
    const outcome = await this.objects().resolveForServing(objectId, token);
    if (outcome.status !== 200) {
      json(res, outcome.status, { error: outcome.error });
      return;
    }
    if (!existsSync(outcome.path) || !statSync(outcome.path).isFile()) {
      json(res, 404, { error: 'Object not found' });
      return;
    }
    const headers: Record<string, string | number> = {
      'Content-Type': outcome.meta.contentType,
      'Content-Length': statSync(outcome.path).size,
      'Cache-Control': 'no-cache',
    };
    if (outcome.meta.filename) {
      headers['Content-Disposition'] =
        `inline; filename="${outcome.meta.filename.replace(/["\\]/g, '')}"`;
    }
    res.writeHead(200, headers);
    createReadStream(outcome.path).pipe(res);
  }

  /**
   * Resolve a relative path against a base directory, ensuring the result
   * stays within the base. Returns null if the path escapes the base.
   */
  private resolveSafePath(baseDir: string, relPath: string): string | null {
    const base = resolve(baseDir);
    const normalized = normalize(relPath);

    // Reject absolute paths and parent traversal attempts
    if (normalized.startsWith('..') || normalized.startsWith(`${sep}..`)) {
      return null;
    }

    const target = join(base, normalized);
    const rel = relative(base, target);

    // If the relative path starts with '..', the target is outside base
    if (rel.startsWith('..') || rel === '') {
      // rel === '' means the target IS the base dir itself — allow only if it's a file
      if (rel === '' && existsSync(target) && statSync(target).isFile()) {
        return target;
      }
      if (rel.startsWith('..')) return null;
    }

    return target;
  }

  /**
   * Determine the base URL for building absolute links in the launcher.
   * Uses `publicUrl` if configured, otherwise falls back to request headers.
   */
  private getBaseUrl(req: IncomingMessage): string {
    if (this.publicUrl) {
      return this.publicUrl.replace(/\/+$/, '');
    }

    const proto = req.headers['x-forwarded-proto'] ?? 'http';
    const host = req.headers['x-forwarded-host'] ?? req.headers.host;
    if (host) return `${proto}://${host}`;

    const port = this._info?.port ?? this.defaultPort;
    return `http://localhost:${port}`;
  }

  // -------------------------------------------------------------------------
  // Management API
  // -------------------------------------------------------------------------

  /**
   * Pending Approvals for the Approver (POLICY-REQ-7): `GET /approvals` lists
   * them and `POST /approvals/{id}` with `{ decision: 'approve' | 'deny' }`
   * decides one. Only the `admin` Principal may answer; an open station has
   * no other caller.
   *
   * @spec POLICY-REQ-7
   */
  private async handleApprovals(
    req: IncomingMessage,
    res: ServerResponse,
    url: string,
    authResult?: { principalId: string },
  ): Promise<void> {
    const principalId = authResult?.principalId ?? ADMIN_PRINCIPAL_ID;
    if (principalId !== ADMIN_PRINCIPAL_ID) {
      json(res, 403, { error: 'Only the Approver can answer approvals' });
      return;
    }
    if (!this.approvalManager) {
      json(res, 404, { error: 'Approvals not configured' });
      return;
    }
    const method = req.method ?? 'GET';
    // @spec POLICY-REQ-7
    if (url === '/approvals' && method === 'GET') {
      json(res, 200, { approvals: this.approvalManager.listPending() });
      return;
    }
    const match = url.match(/^\/approvals\/([^/]+)$/);
    if (match && method === 'POST') {
      const body = JSON.parse(await readBody(req)) as { decision?: string };
      if (body.decision !== 'approve' && body.decision !== 'deny') {
        json(res, 400, { error: "Field 'decision' must be 'approve' or 'deny'" });
        return;
      }
      if (!this.approvalManager.decide(match[1], body.decision, principalId)) {
        json(res, 404, { error: 'Approval not found, already decided or expired' });
        return;
      }
      json(res, 200, { decided: true, decision: body.decision });
      return;
    }
    json(res, 404, { error: `Not found: ${method} ${url}` });
  }

  private async handleManagementApi(
    req: IncomingMessage,
    res: ServerResponse,
    url: string,
    _authResult?: { identity?: ApiKeyIdentity; principalId: string },
  ): Promise<void> {
    const method = req.method ?? 'GET';

    // --- API Keys CRUD ---
    if (url === '/api/keys' && method === 'GET') {
      if (!this.apiKeyStore) {
        json(res, 404, { error: 'API keys not configured' });
        return;
      }
      const keys = await this.apiKeyStore.list();
      json(res, 200, { keys });
      return;
    }

    if (url === '/api/keys' && method === 'POST') {
      if (!this.apiKeyStore) {
        json(res, 404, { error: 'API keys not configured' });
        return;
      }
      const body = JSON.parse(await readBody(req));
      const { raw, hash, prefix } = generateApiKeyPair();
      const now = new Date().toISOString();
      const id = `ak_${randomId()}`;
      const record = {
        id,
        name: body.name,
        keyHash: hash,
        prefix,
        identity: body.identity ?? { userId: body.userId ?? 'anonymous' },
        // POLICY-REQ-1: each key is its own Principal unless it names one.
        principalId: (body.principalId as string | undefined) ?? id,
        createdAt: now,
        updatedAt: now,
        expiresAt: body.expiresAt,
      };
      await this.apiKeyStore.create(record);
      // Return raw key exactly once
      json(res, 201, { ...record, key: raw });
      return;
    }

    const keyMatch = url.match(/^\/api\/keys\/([^/]+)$/);
    if (keyMatch && method === 'DELETE') {
      if (!this.apiKeyStore) {
        json(res, 404, { error: 'API keys not configured' });
        return;
      }
      const revoked = await this.apiKeyStore.revoke(keyMatch[1]);
      if (!revoked) {
        json(res, 404, { error: 'Key not found' });
        return;
      }
      json(res, 200, { revoked: true });
      return;
    }

    json(res, 404, { error: `Not found: ${method} ${url}` });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function generateApiKeyPair(): { raw: string; hash: string; prefix: string } {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const raw = `aak_${hex}`;
  const hash = hashApiKey(raw);
  return { raw, hash, prefix: raw.slice(0, 12) };
}

// ---------------------------------------------------------------------------
// Static serving helpers
// ---------------------------------------------------------------------------

/** Escape HTML special characters to prevent injection in the launcher page. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** MIME type lookup for common static file extensions. */
function getMimeType(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
  const types: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    mjs: 'application/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    map: 'application/json; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    wasm: 'application/wasm',
    pdf: 'application/pdf',
  };
  return types[ext] ?? 'application/octet-stream';
}

/**
 * Resolve a screen's `bundleUrl` into a link the launcher can use.
 *
 * If the bundleUrl is a relative path (e.g. `dist/screen.js`), it's served
 * through the station's `/apps/:appId/bundles/` route. If it's an absolute
 * URL (http/https), it's used as-is.
 */
function resolveBundleLink(bundleUrl: string, appId: string, baseUrl: string): string {
  // Absolute URLs are used directly
  if (bundleUrl.startsWith('http://') || bundleUrl.startsWith('https://')) {
    return bundleUrl;
  }

  // Relative paths are served through the station's bundle route
  const cleanPath = bundleUrl.replace(/^\.?\//, '');
  return `${baseUrl}/apps/${encodeURIComponent(appId)}/bundles/${cleanPath}`;
}

// ---------------------------------------------------------------------------
// Convenience
// ---------------------------------------------------------------------------

export async function serve(options: StationServerOptions): Promise<StationServer> {
  const server = new StationServer(options);
  await server.start();
  return server;
}
