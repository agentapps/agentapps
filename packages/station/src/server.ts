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

import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join, normalize, relative, resolve, sep } from 'node:path';
import {
  ADMIN_PRINCIPAL_ID,
  type ApiKeyIdentity,
  type ApiKeyRole,
  createInProcessTransportPair,
  ErrorCode,
  type MessageBase,
  OBJECT_REQUEST_TYPES,
  resolveAuthSetup,
  STORAGE_REQUEST_TYPES,
  type Transport,
} from '@agentapps/protocol';
import type { ApiKeyStore } from './api-key-store.js';
import { hashApiKey } from './api-key-store.js';
import { AppStation } from './app-station.js';
import { ApprovalManager } from './approval-manager.js';
import { type DataStore, documentsOf } from './data-store.js';
import { handleStorageRequest } from './document-store.js';
import { handleObjectRequest, ObjectStore } from './file-handlers/object-store.js';
import {
  handleVolumeRequest,
  resolveMountPath,
  VOLUME_REQUEST_TYPES,
  type VolumeHandlerContext,
} from './file-handlers/volume-handlers.js';
import { type AppFactory, InProcessRuntime } from './in-process-runtime.js';
import { OAuthManager, type OAuthStartParams } from './oauth-manager.js';
import { errorPage, successPage } from './oauth-pages.js';
import { appVisible, evaluatePolicy, toolVisible } from './permission-enforcer.js';
import type { PolicyStore } from './policy-store.js';
import { policyFor } from './policy-store.js';
import type { InstallationSecretScope, SecretStore, SystemSecretScope } from './secret-store.js';
import { StationAdminApi } from './station-admin.js';
import type {
  BindingStore,
  InstallationStore,
  StationInstallation,
  WorkspaceStore,
} from './station-state.js';

export type { StationInstallation } from './station-state.js';

const SERVER_VERSION = '1.0.0';

/** `GET /apps/{appId}/setup` (SETUP-REQ-4). */
const SETUP_ROUTE = /^\/apps\/([^/]+)\/setup$/;

/**
 * The Station's public URL without a trailing slash, or an error when it is
 * missing or not an `http(s)` URL. A Station has no default public URL.
 *
 * @spec SETUP-REQ-11
 */
export function requirePublicUrl(publicUrl: string | undefined): string {
  if (typeof publicUrl !== 'string' || publicUrl.trim() === '') {
    throw new Error(
      'A Station needs a public URL and has no default: pass `publicUrl` (for example "http://localhost:4100").',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(publicUrl);
  } catch {
    throw new Error(`The Station's public URL is not a URL: ${publicUrl}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`The Station's public URL must be http or https: ${publicUrl}`);
  }
  return publicUrl.trim().replace(/\/+$/, '');
}

/** Instance Requests for secrets, answered from the Secret Store (SECRETSTORE-REQ-5). */
const SECRET_CALLBACK_TYPES = new Set([
  'get_system_secrets',
  'get_installation_secrets',
  'update_installation_secrets',
]);

/** Instance Requests about sign-in, answered by the Station, which runs OAuth. */
const AUTH_CALLBACK_TYPES = new Set(['auth_status', 'auth_url', 'refresh_token']);

/** How long before its expiry a token is refreshed when an Instance reads it. */
const REFRESH_SKEW_MS = 60_000;

/**
 * An identifier a Station was given, or an error naming what is missing: a
 * Station computes neither its own id nor its Workspace's.
 *
 * @spec STADMIN-REQ-11
 */
export function requireId(value: string | undefined, what: string, option: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`A Station needs ${what} and does not compute one: pass \`${option}\`.`);
  }
  return value.trim();
}

/**
 * How Apps are added to and removed from a Station that is running. The
 * Station keeps the list; this is what knows how to load an App from a source.
 *
 * @spec STADMIN-REQ-9
 */
export interface AppCatalog {
  /** Add the App at `source` (a path, an `npm:` source or an App id) and load it. */
  add(source: string): Promise<AppEntry>;
  /** Forget an App that was listed. */
  remove(appId: string): Promise<void>;
  /**
   * Make ready an App that is listed but not loaded yet, such as a catalog
   * App that was never downloaded (DIST-REQ-3). Undefined when it is not listed.
   */
  prepare?(appId: string): Promise<AppEntry | undefined>;
  /** The source an available App came from, for listings. */
  sourceOf?(appId: string): string | undefined;
}

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

/** Whether a peer address is this machine: 127.0.0.0/8, ::1, or either mapped into IPv6. */
function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  const plain = address.startsWith('::ffff:') ? address.slice(7) : address;
  return plain === '::1' || plain.startsWith('127.');
}

export interface StationServerOptions {
  apps?: AppEntry[];
  port?: number;
  host?: string;
  /**
   * While the Station is open (no credential configured), accept requests
   * without one only from the machine itself; any other peer is refused.
   *
   * @spec CLI-REQ-12
   */
  openToLoopbackOnly?: boolean;
  token?: string;
  /**
   * The Station's id. Required and stable: it does not change with the
   * machine, the port or the public URL, because secrets and data are tied to
   * it (STADMIN-REQ-11).
   */
  stationId: string;
  /**
   * The id of the Station's home Workspace: the one its admin credential owns.
   * Required; whoever creates the Workspace decides it (STADMIN-REQ-11).
   */
  workspaceId: string;
  /** Where every secret lives. Required (SECRETSTORE-REQ-4). */
  secretStore: SecretStore;
  /** Where app data lives. Required (DATASTORE-REQ-4). */
  dataStore: DataStore;
  idleTimeoutMs?: number;
  /**
   * Public base URL of the station (e.g. "https://your-station.example.com").
   *
   * Required: there is no default and it is never derived from a request or
   * from the port. The OAuth redirect URI of every app is
   * `{publicUrl}/auth/callback`.
   *
   * @spec SETUP-REQ-11
   */
  publicUrl: string;
  /** Stations to announce to on startup. The station POSTs its app catalog so stations discover it automatically. */
  stations?: StationEndpoint[];
  /**
   * Resolve an installationId to its appId. Required for OAuth to find the
   * managed app. In CLI mode, this queries the instance registry.
   */
  resolveInstallation?: (installationId: string) => { appId: string } | undefined;
  /**
   * The workspace's Installations, read on every request so changes apply
   * without a restart. Gateways discover them through `GET /installations`
   * and open sessions as them (POLICY-REQ-10).
   */
  installations?: InstallationStore | (() => StationInstallation[]);
  /** Where Bindings are kept. Without it, binding operations are refused. */
  bindings?: BindingStore;
  /** The Workspaces known besides the home one. Without it, none can be added. */
  workspaces?: WorkspaceStore;
  /** How Apps are added and removed while the Station runs (STADMIN-REQ-9). */
  appCatalog?: AppCatalog;
  /**
   * Apps that became available after the Station started, asked for before
   * Installations are listed so a Gateway sees them without a restart. Returns
   * only apps the Station does not have yet.
   *
   * @spec DIST-REQ-13
   */
  discoverApps?: () => Promise<AppEntry[]>;
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
      /** The role of the API Key; absent for the admin credential (STADMIN-REQ-8). */
      role?: ApiKeyRole;
      /** The Workspace of the API Key; `null` for a Station Operator's. */
      workspaceId?: string | null;
    }
  | false
  | null;

/**
 * Who is calling, as the Station's operations see it.
 *
 * @spec STADMIN-REQ-1
 */
export interface StationCaller {
  principalId: string;
  userId: string;
  /** The admin credential, or an open local Station: operates and owns the home Workspace. */
  admin: boolean;
  /** Operates the Station. */
  operator: boolean;
  /** Owns `workspaceId`. */
  owner: boolean;
  /** The Workspace the caller belongs to; `null` for a Station Operator's key. */
  workspaceId: string | null;
}

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
  /** Parked calls per Session (POLICY-REQ-13). */
  private readonly parkedCalls = new Map<string, number>();
  /** `session_close` messages held back until their Session's parked calls end (POLICY-REQ-13). */
  private readonly heldCloses = new Map<string, { managed: ManagedApp; message: MessageBase }>();
  private httpServer: ReturnType<typeof createServer> | null = null;
  private _info: ServerInfo | null = null;

  private readonly stationId: string;
  private readonly token?: string;
  private readonly idleTimeoutMs: number;
  private readonly defaultPort: number;
  private readonly defaultHost: string;
  private readonly openToLoopbackOnly: boolean;
  private readonly stations: StationEndpoint[];
  private readonly workspaceId: string;
  private readonly secretStore: SecretStore;
  private readonly dataStore: DataStore;
  private readonly resolveInstallation?: (installationId: string) => { appId: string } | undefined;
  private readonly installations?: InstallationStore | (() => StationInstallation[]);
  private readonly bindings?: BindingStore;
  private readonly workspaces?: WorkspaceStore;
  private readonly appCatalog?: AppCatalog;
  private readonly admin: StationAdminApi;
  /** Open event streams per session: `GET /events?sessionId=…` (CLIENT-REQ-1). */
  private readonly eventStreams = new Map<string, Set<ServerResponse>>();
  /** The Workspace of each pending Approval, so its Owner answers it (STADMIN-REQ-1). */
  private readonly approvalWorkspaces = new Map<string, string>();
  private readonly discoverApps?: () => Promise<AppEntry[]>;
  private readonly oauth = new OAuthManager();
  private readonly publicUrl: string;
  private readonly apiKeyStore?: ApiKeyStore;
  private readonly policyStore?: PolicyStore;
  private readonly approvalManager?: ApprovalManager;
  private readonly adminToken?: string;
  private readonly adminRoutes: Record<string, (body: unknown) => Promise<unknown>>;
  /** Objects: immutable blobs per Installation, served at GET /objects/{id}. */
  private objectStore: Promise<ObjectStore> | null = null;
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

  constructor(options: StationServerOptions) {
    // STADMIN-REQ-11: neither id is computed. SECRETSTORE-REQ-4, DATASTORE-REQ-4: no default store.
    this.stationId = requireId(options.stationId, 'an id', 'stationId');
    this.workspaceId = requireId(options.workspaceId, "its Workspace's id", 'workspaceId');
    if (!options.secretStore) {
      throw new Error('A Station needs a Secret Store and has no default: pass `secretStore`.');
    }
    if (!options.dataStore) {
      throw new Error('A Station needs a Data Store and has no default: pass `dataStore`.');
    }
    this.secretStore = options.secretStore;
    this.dataStore = options.dataStore;
    this.token = options.token;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 10 * 60 * 1000;
    this.defaultPort = options.port ?? 4100;
    this.defaultHost = options.host ?? '0.0.0.0';
    this.openToLoopbackOnly = options.openToLoopbackOnly ?? false;
    this.stations = options.stations ?? [];
    this.resolveInstallation = options.resolveInstallation;
    this.installations = options.installations;
    this.bindings = options.bindings;
    this.workspaces = options.workspaces;
    this.appCatalog = options.appCatalog;
    this.discoverApps = options.discoverApps;
    this.publicUrl = requirePublicUrl(options.publicUrl);
    this.apiKeyStore = options.apiKeys;
    this.policyStore = options.policies;
    this.approvalManager = options.policies
      ? new ApprovalManager({ timeoutMs: options.askTimeoutMs })
      : undefined;
    this.adminToken = options.adminToken;
    this.adminRoutes = options.adminRoutes ?? {};
    this.admin = new StationAdminApi({
      stationId: this.stationId,
      homeWorkspaceId: this.workspaceId,
      secretStore: this.secretStore,
      apiKeys: this.apiKeyStore,
      policies: this.policyStore,
      installations: this.installations,
      bindings: this.bindings,
      workspaces: this.workspaces,
      appCatalog: this.appCatalog,
      apps: () => [...this.managedApps.values()].map((m) => m.entry),
      addApp: async (entry) => {
        this.addApp(entry);
        const managed = this.managedApps.get(entry.id);
        if (managed) await this.autoInitialize(managed).catch(() => undefined);
      },
      removeApp: (appId) => this.removeApp(appId),
      discover: () => this.registerDiscoveredApps(),
      authStatus: (installation) => this.authStatusOf(installation),
    });

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
          volume: this.dataStore.volume,
          workspaceId: open.tenant.workspaceId ?? this.workspaceId,
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

      if (msg.type === 'subscription_event' || msg.type === 'inbound_event') {
        this.pushEvent(msg as unknown as Record<string, unknown>);
        return;
      }

      if (AUTH_CALLBACK_TYPES.has(msg.type as string)) {
        void this.handleAuthCallbackRequest(managed, msg as unknown as Record<string, unknown>);
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
    // Open event streams would keep the HTTP server from closing.
    for (const streams of this.eventStreams.values()) for (const stream of streams) stream.end();
    this.eventStreams.clear();

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

  /**
   * Relay a `session_close`. A Session with parked calls is answered
   * `session_closed` at once and ends after its last parked call.
   *
   * @spec POLICY-REQ-13
   */
  private closeSession(
    managed: ManagedApp,
    message: MessageBase,
    timeoutMs?: number,
  ): Promise<MessageBase> {
    const sessionId = (message as Record<string, unknown>).sessionId;
    if (typeof sessionId === 'string' && this.parkedCalls.has(sessionId)) {
      this.heldCloses.set(sessionId, { managed, message });
      return Promise.resolve({
        id: message.id,
        type: 'session_closed',
        timestamp: new Date().toISOString(),
        version: '2.0',
        sessionId,
      } as MessageBase);
    }
    return this.sendAndWait(managed, message, timeoutMs);
  }

  /** A call parked on `sessionId` (POLICY-REQ-13). */
  private holdSession(sessionId: string): void {
    this.parkedCalls.set(sessionId, (this.parkedCalls.get(sessionId) ?? 0) + 1);
  }

  /** A parked call on `sessionId` was decided and answered: end the Session if a close was held. */
  private releaseSession(sessionId: string): void {
    const left = (this.parkedCalls.get(sessionId) ?? 1) - 1;
    if (left > 0) {
      this.parkedCalls.set(sessionId, left);
      return;
    }
    this.parkedCalls.delete(sessionId);
    const held = this.heldCloses.get(sessionId);
    if (!held) return;
    this.heldCloses.delete(sessionId);
    this.sendAndWait(held.managed, held.message, 5_000).catch(() => {});
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

  /** A reply to an Instance's Request, on the App's host side. */
  private replyTo(
    managed: ManagedApp,
    msg: Record<string, unknown>,
    type: string,
    fields: Record<string, unknown>,
  ): void {
    managed.hostSide.send({
      id: `reply-${++idCounter}`,
      type,
      timestamp: new Date().toISOString(),
      version: '2.0',
      sessionId: msg.sessionId as string,
      requestId: msg.requestId as string,
      ...fields,
    } as unknown as MessageBase);
  }

  /** The Installation and Workspace a session's Requests are scoped to. */
  private scopeOf(
    managed: ManagedApp,
    msg: Record<string, unknown>,
  ): { installationId: string; workspaceId: string; permissions?: { volume?: boolean } } {
    return (
      this.sessionScopes.get(msg.sessionId as string) ?? {
        installationId: (msg.installationId as string) ?? managed.entry.id,
        workspaceId: this.workspaceId,
      }
    );
  }

  private secretScopes(
    managed: ManagedApp,
    msg: Record<string, unknown>,
  ): { system: SystemSecretScope; installation: InstallationSecretScope } {
    const scope = this.scopeOf(managed, msg);
    return {
      system: { stationId: this.stationId, appId: managed.entry.id },
      installation: {
        stationId: this.stationId,
        workspaceId: scope.workspaceId,
        installationId: scope.installationId,
      },
    };
  }

  /**
   * Answer an Instance's Request for secrets from the Secret Store. No Host
   * is asked (SECRETSTORE-REQ-5).
   *
   * Replies are `system_secrets` / `installation_secrets` /
   * `update_installation_secrets_response` on success, and a `prompt_result`
   * with `success: false` on failure, so the App's call resolves instead of
   * timing out. No secrets at all answers `null`, as an App expects.
   *
   * @spec SECRETSTORE-REQ-5
   */
  private async handleSecretsCallback(
    managed: ManagedApp,
    msg: Record<string, unknown>,
  ): Promise<void> {
    const { system, installation } = this.secretScopes(managed, msg);
    const orNull = (secrets: Record<string, string>): Record<string, string> | null =>
      Object.keys(secrets).length > 0 ? secrets : null;
    try {
      switch (msg.type) {
        case 'get_system_secrets': {
          const secrets = await this.secretStore.getSystemSecrets(system);
          this.replyTo(managed, msg, 'system_secrets', { secrets: orNull(secrets) });
          return;
        }
        case 'get_installation_secrets': {
          const secrets = await this.freshInstallationSecrets(managed, system, installation);
          this.replyTo(managed, msg, 'installation_secrets', { secrets: orNull(secrets) });
          return;
        }
        case 'update_installation_secrets': {
          await this.secretStore.setInstallationSecrets(
            installation,
            (msg.secrets as Record<string, string>) ?? {},
          );
          this.replyTo(managed, msg, 'update_installation_secrets_response', { success: true });
          return;
        }
      }
    } catch (err) {
      this.replyTo(managed, msg, 'prompt_result', {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** When the stored token expires, from either name a token's expiry was kept under. */
  private static expiryOf(secrets: Record<string, string>): number {
    const raw = secrets.EXPIRY_DATE ?? secrets.expiresAt;
    return raw ? Date.parse(raw) : Number.NaN;
  }

  /**
   * An Installation's secrets, with the access token refreshed first when it
   * is about to expire and a refresh token is stored. A refresh that fails
   * answers the stored secrets; the tool call then surfaces the auth error.
   *
   * @spec SECRETSTORE-REQ-5
   */
  private async freshInstallationSecrets(
    managed: ManagedApp,
    system: SystemSecretScope,
    installation: InstallationSecretScope,
  ): Promise<Record<string, string>> {
    const secrets = await this.secretStore.getInstallationSecrets(installation);
    const expiry = StationServer.expiryOf(secrets);
    if (!Number.isFinite(expiry) || expiry > Date.now() + REFRESH_SKEW_MS) return secrets;
    if (!secrets.REFRESH_TOKEN) return secrets;
    try {
      await this.refreshTokens(managed, system, installation);
      return await this.secretStore.getInstallationSecrets(installation);
    } catch {
      return secrets;
    }
  }

  /**
   * Exchange the stored refresh token for a new access token and keep the
   * result in the Secret Store.
   *
   * @spec SECRETSTORE-REQ-5
   */
  private async refreshTokens(
    managed: ManagedApp,
    system: SystemSecretScope,
    installation: InstallationSecretScope,
  ): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string }> {
    const systemSecrets = await this.secretStore.getSystemSecrets(system);
    const tokenUrl = systemSecrets.tokenUrl ?? managed.entry.auth?.tokenUrl;
    if (!tokenUrl) throw new Error(`${managed.entry.id} declares no token URL to refresh with`);
    for (const name of ['CLIENT_ID', 'CLIENT_SECRET']) {
      if (!systemSecrets[name]) throw new Error(`Missing system secret: ${name}`);
    }
    const stored = await this.secretStore.getInstallationSecrets(installation);
    if (!stored.REFRESH_TOKEN) throw new Error('Missing Installation secret: REFRESH_TOKEN');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: stored.REFRESH_TOKEN,
        client_id: systemSecrets.CLIENT_ID as string,
        client_secret: systemSecrets.CLIENT_SECRET as string,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      // The body of a failed refresh is not echoed: it may name the credentials sent.
      throw new Error(`Token refresh failed: ${response.status}`);
    }
    const data = (await response.json()) as Record<string, unknown>;
    const accessToken = data.access_token as string | undefined;
    if (!accessToken) throw new Error('Token refresh response missing access_token');
    const refreshToken = (data.refresh_token as string | undefined) ?? stored.REFRESH_TOKEN;
    const expiresAt =
      typeof data.expires_in === 'number'
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined;

    await this.secretStore.setInstallationSecrets(installation, {
      ACCESS_TOKEN: accessToken,
      REFRESH_TOKEN: refreshToken,
      ...(expiresAt ? { EXPIRY_DATE: expiresAt } : {}),
    });
    // One name for the expiry from now on.
    const stale = [...(expiresAt ? [] : ['EXPIRY_DATE']), 'expiresAt'];
    await this.secretStore.removeInstallationSecrets(installation, stale);
    return { accessToken, refreshToken, ...(expiresAt ? { expiresAt } : {}) };
  }

  /** Whether an Installation is signed in, from its stored secrets. */
  private async authStatusOf(installation: {
    installationId: string;
    appId: string;
    workspaceId?: string;
  }): Promise<{
    authenticated: boolean;
    authRequired?: boolean;
    provider?: string;
    scopes?: string[];
    expiresAt?: string;
  }> {
    const secrets = await this.secretStore.getInstallationSecrets({
      stationId: this.stationId,
      workspaceId: installation.workspaceId ?? this.workspaceId,
      installationId: installation.installationId,
    });
    const auth = this.managedApps.get(installation.appId)?.entry.auth;
    const expiry = StationServer.expiryOf(secrets);
    const expired = Number.isFinite(expiry) && expiry <= Date.now();
    // A stored refresh token mints a new access token on demand.
    const authenticated = (!!secrets.ACCESS_TOKEN && !expired) || !!secrets.REFRESH_TOKEN;
    return {
      authenticated,
      ...(authenticated ? {} : { authRequired: true }),
      ...(auth?.provider ? { provider: auth.provider } : {}),
      ...(auth?.scopes ? { scopes: auth.scopes } : {}),
      ...(Number.isFinite(expiry) ? { expiresAt: new Date(expiry).toISOString() } : {}),
    };
  }

  /**
   * Answer an Instance's Request about sign-in: the Station runs OAuth and
   * keeps the tokens, so it answers these itself.
   *
   * @spec SECRETSTORE-REQ-5
   */
  private async handleAuthCallbackRequest(
    managed: ManagedApp,
    msg: Record<string, unknown>,
  ): Promise<void> {
    const { system, installation } = this.secretScopes(managed, msg);
    try {
      switch (msg.type) {
        case 'refresh_token': {
          const tokens = await this.refreshTokens(managed, system, installation);
          this.replyTo(managed, msg, 'refresh_token_response', tokens);
          return;
        }
        case 'auth_status': {
          const status = await this.authStatusOf({
            installationId: installation.installationId,
            appId: managed.entry.id,
            workspaceId: installation.workspaceId,
          });
          this.replyTo(managed, msg, 'auth_status_result', status);
          return;
        }
        case 'auth_url': {
          const started = await this.startOAuth(installation.installationId, managed.entry.id, {
            userId: 'anonymous',
            workspaceId: installation.workspaceId,
          });
          if ('error' in started) throw new Error(started.error);
          this.replyTo(managed, msg, 'auth_url_result', started);
          return;
        }
      }
    } catch (err) {
      this.replyTo(managed, msg, 'prompt_result', {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Hand an App's event to whoever is listening to its session. */
  private pushEvent(event: Record<string, unknown>): void {
    for (const stream of this.eventStreams.get(event.sessionId as string) ?? []) {
      stream.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }

  /**
   * `GET /events?sessionId=X`: the events an App emits on a session, as
   * Server-Sent Events, for a Host that reaches the Station over HTTP. The
   * caller must be of the session's Workspace.
   *
   * @spec CLIENT-REQ-1
   */
  private handleEvents(req: IncomingMessage, res: ServerResponse, caller: StationCaller): void {
    const parsed = new URL(req.url ?? '/', 'http://station');
    const sessionId = parsed.searchParams.get('sessionId') ?? '';
    const scope = this.sessionScopes.get(sessionId);
    if (!scope || (!caller.admin && scope.workspaceId !== caller.workspaceId)) {
      json(res, 404, { error: 'Session not found' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': listening\n\n');
    const streams = this.eventStreams.get(sessionId) ?? new Set<ServerResponse>();
    streams.add(res);
    this.eventStreams.set(sessionId, streams);
    req.on('close', () => {
      streams.delete(res);
      if (streams.size === 0) this.eventStreams.delete(sessionId);
    });
  }

  /** The Installations the Station knows. */
  private listInstallations(): StationInstallation[] {
    const source = this.installations;
    if (!source) return [];
    return typeof source === 'function' ? source() : source.list();
  }

  private findInstallation(installationId: string): StationInstallation | undefined {
    return this.listInstallations().find((i) => i.installationId === installationId);
  }

  /**
   * `GET /installations`: the Installations the caller's Principal may use.
   * Needs a credential even when the Station is otherwise open.
   *
   * @spec POLICY-REQ-10
   * @spec POLICY-REQ-12
   */
  private async handleInstallations(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const credential = await this.credentialOf(req);
    if (!credential) {
      json(res, 401, { error: 'Unauthorized: GET /installations needs an API key' });
      return;
    }
    const caller = this.callerOf(credential);
    const { principalId } = caller;
    await this.registerDiscoveredApps();
    const policy = this.policyStore ? await policyFor(this.policyStore, principalId) : undefined;
    const installations = this.listInstallations()
      // STADMIN-REQ-3: a key reaches only its Workspace's Installations.
      .filter((i) => (i.workspaceId ?? this.workspaceId) === caller.workspaceId)
      .filter((i) => this.managedApps.has(i.appId))
      .filter((i) => !policy || appVisible(policy, i.appId))
      .map((i) => ({
        installationId: i.installationId,
        alias: i.alias,
        appId: i.appId,
        name: this.managedApps.get(i.appId)?.entry.name ?? i.appId,
      }));
    json(res, 200, { installations });
  }

  /**
   * Register and initialize the apps that appeared since the Station started.
   *
   * @spec DIST-REQ-13
   */
  private async registerDiscoveredApps(): Promise<void> {
    if (!this.discoverApps) return;
    for (const entry of await this.discoverApps()) {
      if (this.managedApps.has(entry.id)) continue;
      this.addApp(entry);
      const managed = this.managedApps.get(entry.id);
      if (managed) await this.autoInitialize(managed).catch(() => undefined);
    }
  }

  /**
   * What a request's bearer credential is: an API Key with its role and
   * Workspace, or the admin credential. Undefined when there is none or it is
   * not valid. Checked even on an open Station.
   *
   * @spec STADMIN-REQ-8
   */
  private async credentialOf(
    req: IncomingMessage,
  ): Promise<Exclude<AuthResult, false | null> | undefined> {
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!bearer) return undefined;
    if (this.apiKeyStore && bearer.startsWith('aak_')) {
      const record = await this.apiKeyStore.getByHash(hashApiKey(bearer));
      if (!record) return undefined;
      const role = record.role ?? 'workspace-member';
      return {
        identity: record.identity,
        principalId: record.principalId,
        role,
        // STADMIN-REQ-3: a Station Operator's key belongs to no Workspace.
        workspaceId: role === 'station-operator' ? null : (record.workspaceId ?? this.workspaceId),
      };
    }
    // Legacy single-token auth, and the local admin credential handed to the
    // CLI that launched the station.
    if (this.token && bearer === this.token) {
      return { identity: { userId: 'local' }, principalId: ADMIN_PRINCIPAL_ID };
    }
    if (this.adminToken && bearer === this.adminToken) {
      return { identity: { userId: ADMIN_PRINCIPAL_ID }, principalId: ADMIN_PRINCIPAL_ID };
    }
    return undefined;
  }

  /**
   * Who is calling. The admin credential, and a caller an open local Station
   * let in without one, operate the Station and own its home Workspace
   * (STADMIN-REQ-2).
   *
   * @spec STADMIN-REQ-1
   */
  private callerOf(auth: AuthResult | undefined): StationCaller {
    if (!auth || auth.principalId === ADMIN_PRINCIPAL_ID) {
      return {
        principalId: ADMIN_PRINCIPAL_ID,
        userId: (auth || undefined)?.identity?.userId ?? ADMIN_PRINCIPAL_ID,
        admin: true,
        operator: true,
        owner: true,
        workspaceId: this.workspaceId,
      };
    }
    return {
      principalId: auth.principalId,
      userId: auth.identity?.userId ?? auth.principalId,
      admin: false,
      operator: auth.role === 'station-operator',
      owner: auth.role === 'workspace-owner',
      workspaceId: auth.workspaceId === undefined ? this.workspaceId : auth.workspaceId,
    };
  }

  private resolveApp(message: Record<string, unknown>): ManagedApp | undefined {
    if (typeof message.installationId === 'string') {
      const m = this.managedApps.get(message.installationId);
      if (m) return m;
      const installation = this.findInstallation(message.installationId);
      if (installation) return this.managedApps.get(installation.appId);
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
  // Data Requests: Storage, Volume and Objects, answered from the Data Store
  // -------------------------------------------------------------------------

  /**
   * Answer an Instance's Storage Request from the Data Store, scoped to the
   * session's Installation. No Host is asked.
   *
   * @spec DATASTORE-REQ-5
   */
  private async handleStorageCallback(
    managed: ManagedApp,
    msg: Record<string, unknown>,
  ): Promise<void> {
    const scope = this.scopeOf(managed, msg);
    const documents = documentsOf(this.dataStore.documents, {
      stationId: this.stationId,
      workspaceId: scope.workspaceId,
      installationId: scope.installationId,
    });
    try {
      const response = await handleStorageRequest(documents, scope.installationId, msg);
      this.replyTo(managed, msg, response.type, response.fields);
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Storage error';
      this.replyTo(managed, msg, `${msg.type as string}_response`, { success: false, error });
    }
  }

  /**
   * Answer an Instance's Volume Request from the Data Store. The Workspace
   * and the Effective Permissions come from the session this server opened
   * (VOL-REQ-1, VOL-REQ-2).
   *
   * @spec DATASTORE-REQ-5
   */
  private async handleVolumeRequest(
    managed: ManagedApp,
    msg: Record<string, unknown>,
  ): Promise<void> {
    const sessionId = msg.sessionId as string;
    const scope = this.sessionScopes.get(sessionId);
    const ctx: VolumeHandlerContext = {
      volume: this.dataStore.volume,
      workspaceId: scope?.workspaceId ?? this.workspaceId,
      sessionId,
      permissions: scope?.permissions,
    };
    const failed = (error: string): void =>
      this.replyTo(managed, msg, `${msg.type as string}_result`, { success: false, error });
    try {
      const response = await handleVolumeRequest(ctx, msg);
      if (response) managed.hostSide.send(response as unknown as MessageBase);
      else failed(`Unknown volume request: ${msg.type as string}`);
    } catch (err) {
      failed(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * The Station's object rules over the Data Store, built once: they need
   * the link-signing secret, which lives in the Secret Store and is created
   * there the first time (SECRETSTORE-REQ-7).
   *
   * @spec SECRETSTORE-REQ-7
   */
  private objects(): Promise<ObjectStore> {
    if (!this.objectStore) {
      this.objectStore = (async () => {
        const scope = { stationId: this.stationId };
        let secret = await this.secretStore.getLinkSigningSecret(scope);
        if (!secret) {
          secret = randomBytes(32).toString('hex');
          await this.secretStore.setLinkSigningSecret(scope, secret);
        }
        return new ObjectStore({
          objects: this.dataStore.objects,
          stationId: this.stationId,
          stationSecret: secret,
          publicUrl: this.publicUrl,
        });
      })();
      // A failure is not kept: the next Request tries again.
      this.objectStore.catch(() => {
        this.objectStore = null;
      });
    }
    return this.objectStore;
  }

  /**
   * Answer an Instance's object Request from the Data Store, scoped to the
   * session's Installation and Workspace.
   *
   * @spec DATASTORE-REQ-5
   */
  private async handleObjectCallback(
    managed: ManagedApp,
    msg: Record<string, unknown>,
  ): Promise<void> {
    const failed = (error: string): void =>
      this.replyTo(managed, msg, 'prompt_result', { success: false, error });
    try {
      const response = await handleObjectRequest(
        await this.objects(),
        this.scopeOf(managed, msg),
        msg,
      );
      if (response) managed.hostSide.send(response as unknown as MessageBase);
      else failed(`Unknown object request: ${msg.type as string}`);
    } catch (err) {
      failed(err instanceof Error ? err.message : String(err));
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
        this.closeSession(managed, closeMsg, 5_000).catch(() => {});

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

    // @spec POLICY-REQ-10
    // @spec POLICY-REQ-12
    if (url === '/installations' && req.method === 'GET') {
      await this.handleInstallations(req, res);
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

    // @spec CLIENT-REQ-1
    if (req.method === 'GET' && url.startsWith('/events')) {
      this.handleEvents(req, res, this.callerOf(authResult));
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
      await this.handleApprovals(req, res, url, this.callerOf(authResult));
      return;
    }

    // @spec STADMIN-REQ-5
    if (url.startsWith('/api/')) {
      await this.admin.handle(req, res, url, this.callerOf(authResult));
      return;
    }

    // App discovery & static serving routes
    if (req.method === 'GET' && (url === '/apps' || url === '/apps/')) {
      this.handleAppCatalog(res);
      return;
    }

    const setupMatch = url.match(SETUP_ROUTE);
    if (req.method === 'GET' && setupMatch) {
      this.handleAppSetup(res, decodeURIComponent(setupMatch[1] ?? ''), authResult);
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
   * The OAuth redirect URI of this Station: its public URL followed by
   * `/auth/callback`. The one value used in the authorize URL, in the token
   * exchange and in resolved setup instructions; never derived from a
   * request's headers or from the port.
   *
   * @spec SETUP-REQ-2
   */
  private getOAuthRedirectUri(): string {
    return `${this.publicUrl}/auth/callback`;
  }

  /**
   * GET /apps/{appId}/setup — the App's setup instructions with every
   * variable replaced by its value, for the Station Operator only.
   *
   * Answers `{ instructions: null }` for an App that declares none. The only
   * values injected are this Station's own URLs (SETUP-NFR-1).
   *
   * @spec SETUP-REQ-4
   */
  private handleAppSetup(res: ServerResponse, appId: string, authResult: AuthResult): void {
    if (((authResult || undefined)?.principalId ?? ADMIN_PRINCIPAL_ID) !== ADMIN_PRINCIPAL_ID) {
      json(res, 403, { error: 'Only the Station Operator may read setup instructions' });
      return;
    }
    const managed = this.managedApps.get(appId);
    if (!managed) {
      json(res, 404, { error: `App not found: ${appId}` });
      return;
    }
    const auth = managed.entry.manifest?.auth as { setup?: unknown } | undefined;
    const setup = typeof auth?.setup === 'string' ? auth.setup : undefined;
    json(res, 200, {
      instructions: setup
        ? resolveAuthSetup(setup, { redirectUri: this.getOAuthRedirectUri() })
        : null,
    });
  }

  // -------------------------------------------------------------------------
  // OAuth handlers
  // -------------------------------------------------------------------------

  /**
   * Begin an OAuth flow for an Installation: read the App's auth config and
   * its client from the Secret Store, and build the authorize URL with this
   * Station's redirect URI.
   */
  private async startOAuth(
    installationId: string,
    appId: string,
    tenant: { userId: string; workspaceId: string },
  ): Promise<{ url: string; state: string } | { status: number; error: string }> {
    const managed = this.managedApps.get(appId);
    if (!managed) return { status: 404, error: `App not found: ${appId}` };

    const authConfig = managed.entry.auth;
    if (!authConfig?.authorizeUrl || !authConfig?.tokenUrl) {
      return { status: 400, error: `App ${appId} does not support OAuth (missing auth config)` };
    }

    let systemSecrets: Record<string, string>;
    try {
      systemSecrets = await this.secretStore.getSystemSecrets({ stationId: this.stationId, appId });
    } catch {
      return { status: 500, error: 'Failed to read system secrets' };
    }
    const clientId = systemSecrets.CLIENT_ID;
    const clientSecret = systemSecrets.CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { status: 500, error: `Missing CLIENT_ID or CLIENT_SECRET for ${appId}` };
    }

    const params: OAuthStartParams = {
      installationId,
      appId,
      tenant,
      provider: authConfig.provider ?? 'oauth2',
      authorizeUrl: authConfig.authorizeUrl,
      tokenUrl: authConfig.tokenUrl,
      clientId,
      clientSecret,
      // SETUP-REQ-2: the Station's own redirect URI, the same for every App.
      redirectUri: this.getOAuthRedirectUri(),
      scopes: authConfig.scopes,
    };
    return this.oauth.startAuth(params);
  }

  /**
   * GET /auth/start?installationId=X[&userId=Z]
   *
   * Initiates an OAuth flow for an Installation, and either redirects the
   * browser (302) or returns JSON with the URL. The tokens will belong to the
   * Installation's own Workspace, whatever the caller says.
   */
  private async handleAuthStart(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsed = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const installationId = parsed.searchParams.get('installationId');
    const userId = parsed.searchParams.get('userId') ?? 'anonymous';

    if (!installationId) {
      json(res, 400, { error: 'Missing required query parameter: installationId' });
      return;
    }

    const installation = this.findInstallation(installationId);
    const appId = this.resolveInstallation?.(installationId)?.appId ?? installation?.appId;
    if (!appId) {
      json(res, 404, { error: `Unknown installationId: ${installationId}` });
      return;
    }

    const started = await this.startOAuth(installationId, appId, {
      userId,
      workspaceId: installation?.workspaceId ?? this.workspaceId,
    });
    if ('error' in started) {
      json(res, started.status, { error: started.error });
      return;
    }

    // If the browser wants HTML, redirect directly. Otherwise return JSON.
    const accept = req.headers.accept ?? '';
    if (accept.includes('text/html')) {
      res.writeHead(302, { Location: started.url });
      res.end();
    } else {
      json(res, 200, started);
    }
  }

  /**
   * GET /auth/callback?code=…&state=…
   *
   * The provider's redirect: exchanges the code for tokens, keeps them in the
   * Secret Store as the Installation's secrets, and shows a result page.
   *
   * @spec SECRETSTORE-REQ-5
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
      await this.secretStore.setInstallationSecrets(
        {
          stationId: this.stationId,
          workspaceId: result.tenant?.workspaceId ?? this.workspaceId,
          installationId: result.installationId,
        },
        result.tokens as unknown as Record<string, string>,
      );
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
   * Whether an Installation holds tokens. Polled by the CLI after it
   * delegates OAuth to the station via /auth/start.
   */
  private async handleAuthStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsed = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const installationId = parsed.searchParams.get('installationId');

    if (!installationId) {
      json(res, 400, { error: 'Missing required query parameter: installationId' });
      return;
    }

    try {
      const secrets = await this.secretStore.getInstallationSecrets({
        stationId: this.stationId,
        workspaceId: this.findInstallation(installationId)?.workspaceId ?? this.workspaceId,
        installationId,
      });
      json(res, 200, { authenticated: !!(secrets.ACCESS_TOKEN || secrets.REFRESH_TOKEN) });
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
    authResult?: Exclude<AuthResult, false | null>,
  ): Promise<void> {
    let body: string;
    try {
      body = await readBody(req);
    } catch {
      json(res, 400, { error: 'Failed to read request body' });
      return;
    }
    const caller = this.callerOf(authResult);

    let message: MessageBase;
    try {
      message = JSON.parse(body) as MessageBase;
    } catch {
      json(res, 400, { error: 'Invalid JSON' });
      return;
    }

    // POLICY-REQ-10: a session opened as a known Installation gets that
    // Installation's Effective Permissions from the Station's record, not
    // from what the caller claims.
    if (message.type === 'session_open') {
      const open = message as MessageBase & Record<string, unknown>;
      const installation =
        typeof open.installationId === 'string'
          ? this.findInstallation(open.installationId)
          : undefined;
      if (installation) {
        open.effectivePermissions = { permissions: installation.permissions ?? {} };
      }
      // A session runs in its Installation's Workspace, never in the one the
      // caller claims. Only the admin, who operates the Station, may name the
      // Workspace of a session that is not an Installation's (STADMIN-REQ-3).
      const tenant = (open.tenant ?? {}) as Record<string, unknown>;
      const claimed = typeof tenant.workspaceId === 'string' ? tenant.workspaceId : undefined;
      const workspaceId = installation
        ? (installation.workspaceId ?? this.workspaceId)
        : caller.admin
          ? (claimed ?? this.workspaceId)
          : caller.workspaceId;
      if (workspaceId === null || (!caller.admin && caller.workspaceId !== workspaceId)) {
        // The same answer as for something that does not exist (STADMIN-NFR-1).
        json(res, 404, { error: 'No matching app found' });
        return;
      }
      open.tenant = { ...tenant, workspaceId };
    } else {
      const sessionId = (message as Record<string, unknown>).sessionId;
      const scope = typeof sessionId === 'string' ? this.sessionScopes.get(sessionId) : undefined;
      if (scope && !caller.admin && scope.workspaceId !== caller.workspaceId) {
        json(res, 404, { error: 'No matching app found' });
        return;
      }
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

    // The Approval this call was parked on and approved by, if any (POLICY-REQ-14).
    let approved: { id: string; principalId: string; app: string; tool: string } | undefined;
    // The Session this call held while parked (POLICY-REQ-13).
    let heldSessionId: string | undefined;

    // POLICY-REQ-5: evaluate the Principal's Policy before relaying a tool call.
    // An open station (no credential configured) serves only its local admin.
    if (message.type === 'tool_call' && this.policyStore) {
      const msg = message as MessageBase & { tool?: string; arguments?: Record<string, unknown> };
      const toolName = msg.tool ?? '';
      const args = msg.arguments ?? {};
      const principalId = authResult?.principalId ?? ADMIN_PRINCIPAL_ID;
      const policy = await policyFor(this.policyStore, principalId);
      // POLICY-REQ-16: Rules on Annotations cannot be evaluated without them.
      const known = await this.ensureToolAnnotations(managed, message);
      if (known !== true && known !== false) {
        // The App refused the listing (an unknown Session, for example): the
        // caller gets that answer for its call, which is not relayed.
        json(res, 200, { ...known, id: message.id });
        return;
      }
      if (!known) {
        const reason = `The tools of ${managed.entry.id} could not be listed, so ${principalId}'s Policy cannot be evaluated for '${toolName}'`;
        // eslint-disable-next-line no-console
        console.error(
          `[policy] deny: principal=${principalId} app=${managed.entry.id} tool=${toolName} rule=annotations-unknown at=${new Date().toISOString()}`,
        );
        json(res, 403, {
          id: message.id,
          type: 'error',
          timestamp: new Date().toISOString(),
          version: '2.0',
          error: {
            code: ErrorCode.PERMISSION_DENIED,
            message: reason,
            details: { layer: 'policy', rule: 'annotations-unknown', reason },
          },
        });
        return;
      }
      const decision = evaluatePolicy(policy, {
        app: managed.entry.id,
        tool: toolName,
        args,
        annotations: this.getToolAnnotations(managed.entry.id, toolName),
      });

      let outcome: 'allow' | 'deny' | 'timeout' | 'cancelled' =
        decision.effect === 'deny' ? 'deny' : 'allow';
      if (decision.effect === 'ask' && this.approvalManager) {
        const approvals = this.approvalManager;
        const call = { principalId, app: managed.entry.id, tool: toolName };
        // POLICY-REQ-13: the Session stays able to relay this call while it is parked.
        const sessionId = (message as Record<string, unknown>).sessionId;
        if (typeof sessionId === 'string') {
          heldSessionId = sessionId;
          this.holdSession(sessionId);
        }
        // POLICY-REQ-14: a caller that goes away cancels its Approval.
        let approvalId: string | undefined;
        const onCallerGone = (): void => {
          if (approvalId) approvals.cancel(approvalId);
        };
        res.once('close', onCallerGone);
        // POLICY-REQ-6: park until the Approver decides or the Approval expires.
        const answer = await approvals.park({ ...call, args, rule: decision.rule }, (info) => {
          approvalId = info.id;
          // STADMIN-REQ-1: the Owner of the caller's Workspace answers it.
          this.approvalWorkspaces.set(info.id, caller.workspaceId ?? this.workspaceId);
          if (res.destroyed) approvals.cancel(info.id);
        });
        if (approvalId) this.approvalWorkspaces.delete(approvalId);
        res.off('close', onCallerGone);
        outcome = answer === 'approve' ? 'allow' : answer;
        if (answer === 'approve' && approvalId) approved = { id: approvalId, ...call };
      }

      if (outcome === 'cancelled') {
        // Nobody is left to answer; the cancellation is already logged.
        if (heldSessionId) this.releaseSession(heldSessionId);
        return;
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
        if (heldSessionId) this.releaseSession(heldSessionId);
        return;
      }
    }

    try {
      const response =
        message.type === 'session_close'
          ? await this.closeSession(managed, message)
          : await this.sendAndWait(managed, message);
      // POLICY-REQ-14: an approved call that the Instance answers with an error is logged.
      if (approved && response.type === 'error') {
        const code = (response as { error?: { code?: string } }).error?.code ?? 'UNKNOWN';
        this.approvalManager?.logApprovedCallFailed(approved.id, approved, code);
      }
      if (message.type === 'session_open' && response.type === 'session_opened') {
        const open = message as Record<string, unknown>;
        const tenant = open.tenant as { workspaceId?: string } | undefined;
        this.sessionScopes.set((response as Record<string, unknown>).sessionId as string, {
          installationId: (open.installationId as string) ?? managed.entry.id,
          workspaceId: tenant?.workspaceId ?? this.workspaceId,
          permissions: (open.effectivePermissions as { permissions?: { volume?: boolean } })
            ?.permissions,
        });
      }
      // POLICY-REQ-4: Rules on Annotations need the tools' Annotations.
      if (message.type === 'list_tools') {
        const tools = (response as Record<string, unknown>).tools as
          | Array<{ name: string; annotations?: Record<string, unknown> }>
          | undefined;
        if (tools) {
          this.cacheTools(managed.entry.id, tools);
          // POLICY-REQ-11: drop the tools this Principal's Policy always denies.
          if (this.policyStore) {
            const policy = await policyFor(
              this.policyStore,
              authResult?.principalId ?? ADMIN_PRINCIPAL_ID,
            );
            (response as Record<string, unknown>).tools = tools.filter((t) =>
              toolVisible(policy, managed.entry.id, t.name, t.annotations),
            );
          }
        }
      }
      json(res, 200, response);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      // POLICY-REQ-14: an approved call that could not be relayed is logged.
      if (approved) {
        this.approvalManager?.logApprovedCallFailed(approved.id, approved, ErrorCode.TIMEOUT);
      }
      json(res, 504, { error: errMsg });
    } finally {
      if (heldSessionId) this.releaseSession(heldSessionId);
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
      url.startsWith('/events') ||
      SETUP_ROUTE.test(url) ||
      url in this.adminRoutes;
    if (!needsAuth) return null;

    // Auth is enforced once a legacy token is configured or at least one
    // active API key exists. An empty (or fully revoked/expired) key store
    // keeps the station open — creating the first key switches auth on.
    if (!this.token) {
      // CLI-REQ-12: an open Station is open to this machine only.
      const open = this.openToLoopbackOnly && !isLoopback(req.socket.remoteAddress) ? false : null;
      if (!this.apiKeyStore) return open;
      const keys = await this.apiKeyStore.list();
      const now = new Date();
      const hasActiveKey = keys.some(
        (k) => !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt) > now),
      );
      if (!hasActiveKey) return open;
    }

    return (await this.credentialOf(req)) ?? false;
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

  /**
   * Make sure the App's tools, and so their Annotations, are known before a
   * Policy is evaluated for a call: a Station that has not relayed a
   * `list_tools` for the App yet (after a restart, for example) lists them
   * itself in the caller's Session. Returns the App's error when it refuses the
   * listing, and false when it does not answer.
   *
   * @spec POLICY-REQ-16
   */
  private async ensureToolAnnotations(
    managed: ManagedApp,
    call: MessageBase,
  ): Promise<boolean | MessageBase> {
    if (this.toolsCache.has(managed.entry.id)) return true;
    const sessionId = (call as Record<string, unknown>).sessionId;
    if (typeof sessionId !== 'string') return false;
    try {
      const listed = await this.sendAndWait(
        managed,
        {
          id: `annotations-${++idCounter}`,
          type: 'list_tools',
          timestamp: new Date().toISOString(),
          version: '2.0',
          sessionId,
        } as MessageBase,
        10_000,
      );
      if (listed.type === 'error') return listed;
      const tools = (listed as Record<string, unknown>).tools;
      if (!Array.isArray(tools)) return false;
      this.cacheTools(managed.entry.id, tools);
      return true;
    } catch {
      return false;
    }
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
    const outcome = await (await this.objects()).resolveForServing(objectId, token);
    if (outcome.status !== 200) {
      json(res, outcome.status, { error: outcome.error });
      return;
    }
    const headers: Record<string, string | number> = {
      'Content-Type': outcome.meta.contentType,
      'Content-Length': outcome.data.length,
      'Cache-Control': 'no-cache',
    };
    if (outcome.meta.filename) {
      headers['Content-Disposition'] =
        `inline; filename="${outcome.meta.filename.replace(/["\\]/g, '')}"`;
    }
    res.writeHead(200, headers);
    res.end(outcome.data);
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

  /** The base URL for absolute links in the launcher: the Station's public URL. */
  private getBaseUrl(_req: IncomingMessage): string {
    return this.publicUrl;
  }

  // -------------------------------------------------------------------------
  // Management API
  // -------------------------------------------------------------------------

  /**
   * Pending Approvals for the Approver (POLICY-REQ-7): `GET /approvals` lists
   * them and `POST /approvals/{id}` with `{ decision: 'approve' | 'deny' }`
   * decides one. The Approver of a Workspace is its Owner: nobody else sees
   * or decides its Approvals, the Station Operator included.
   *
   * @spec POLICY-REQ-7
   * @spec STADMIN-REQ-1
   */
  private async handleApprovals(
    req: IncomingMessage,
    res: ServerResponse,
    url: string,
    caller: StationCaller,
  ): Promise<void> {
    if (!caller.owner && !caller.operator) {
      json(res, 403, { error: 'Only the Approver can answer approvals' });
      return;
    }
    if (!this.approvalManager) {
      json(res, 404, { error: 'Approvals not configured' });
      return;
    }
    const mine = (id: string): boolean =>
      caller.owner && this.approvalWorkspaces.get(id) === caller.workspaceId;
    const method = req.method ?? 'GET';
    // @spec POLICY-REQ-7
    if (url === '/approvals' && method === 'GET') {
      json(res, 200, { approvals: this.approvalManager.listPending().filter((a) => mine(a.id)) });
      return;
    }
    const match = url.match(/^\/approvals\/([^/]+)$/);
    if (match && method === 'POST') {
      const body = JSON.parse(await readBody(req)) as { decision?: string };
      if (body.decision !== 'approve' && body.decision !== 'deny') {
        json(res, 400, { error: "Field 'decision' must be 'approve' or 'deny'" });
        return;
      }
      const id = match[1] ?? '';
      if (!mine(id) || !this.approvalManager.decide(id, body.decision, caller.principalId)) {
        json(res, 404, { error: 'Approval not found, already decided or expired' });
        return;
      }
      json(res, 200, { decided: true, decision: body.decision });
      return;
    }
    json(res, 404, { error: `Not found: ${method} ${url}` });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
