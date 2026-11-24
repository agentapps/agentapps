/**
 * Station administration over HTTP: every operation on the Station's own
 * state, under `/api/…`, authenticated.
 *
 * Who may do what (STADMIN-REQ-1):
 * - the Station Operator decides which Apps are available, sets their system
 *   secrets, makes Workspaces known and creates Operators' and Owners' keys;
 * - a Workspace Owner does everything inside its Workspace: Installations,
 *   their secrets and Bindings, Policies, and its Members' keys;
 * - a Member administers nothing.
 *
 * A refused operation answers before anything is looked up, and something in
 * another Workspace answers like something that does not exist, so a refusal
 * never tells whether the thing named exists (STADMIN-NFR-1). No answer
 * carries the value of a secret (STADMIN-REQ-4).
 */

import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  ADMIN_PRINCIPAL_ID,
  API_KEY_ROLES,
  type ApiKeyRecord,
  type ApiKeyRole,
  type Policy,
} from '@agentapps/protocol';
import { type ApiKeyStore, generateApiKey } from './api-key-store.js';
import type { PolicyStore } from './policy-store.js';
import { policyFor } from './policy-store.js';
import type { SecretStore } from './secret-store.js';
import type { AppCatalog, AppEntry, StationCaller } from './server.js';
import {
  type BindingStore,
  generateInstallationId,
  type InstallationStore,
  type StationInstallation,
  type WorkspaceStore,
} from './station-state.js';

/** What the admin API needs from the Station it belongs to. */
export interface StationAdminDeps {
  stationId: string;
  homeWorkspaceId: string;
  secretStore: SecretStore;
  apiKeys?: ApiKeyStore;
  policies?: PolicyStore;
  installations?: InstallationStore | (() => StationInstallation[]);
  bindings?: BindingStore;
  workspaces?: WorkspaceStore;
  appCatalog?: AppCatalog;
  /** The Apps available right now. */
  apps(): AppEntry[];
  /** Make an App available without a restart. */
  addApp(entry: AppEntry): Promise<void>;
  removeApp(appId: string): Promise<void>;
  /** Pick up Apps that appeared since the Station started. */
  discover(): Promise<void>;
  authStatus(installation: StationInstallation): Promise<{
    authenticated: boolean;
    provider?: string;
    scopes?: string[];
    expiresAt?: string;
  }>;
}

/** An answer that is not a success: a status, a message and a code a client can act on. */
class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const FORBIDDEN_OPERATOR = () =>
  new Refusal(403, 'Only the Station Operator may do this', 'OPERATOR_ONLY');
const FORBIDDEN_OWNER = () =>
  new Refusal(403, 'Only the Workspace Owner may do this', 'OWNER_ONLY');
const NOT_FOUND = (what: string) => new Refusal(404, `${what} not found`, 'NOT_FOUND');
const UNSUPPORTED = (what: string) =>
  new Refusal(501, `This Station does not keep ${what}`, 'NOT_SUPPORTED');

/** The redirect URI is the Station's, never a secret of an App (SETUP-REQ-8). */
const REDIRECT_URI_KEY = 'REDIRECT_URI';

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function stringRecord(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, v] of Object.entries(value)) if (typeof v === 'string') result[key] = v;
  }
  return result;
}

interface AuthDeclaration {
  type: string;
  provider?: string;
  systemSecrets: string[];
  installationSecrets: string[];
  hasSetup: boolean;
}

/** What an App's Manifest declares about auth; a redirect URI is never one of its secrets. */
function authOf(entry: AppEntry): AuthDeclaration {
  const auth = (entry.manifest?.auth ?? entry.auth ?? undefined) as
    | Record<string, unknown>
    | undefined;
  const extra = Array.isArray(auth?.extraFields)
    ? (auth.extraFields as Array<{ name?: unknown }>).map((f) => f.name)
    : [];
  return {
    type: typeof auth?.type === 'string' ? auth.type : 'none',
    ...(typeof auth?.provider === 'string' ? { provider: auth.provider } : {}),
    systemSecrets: strings(auth?.systemSecrets).filter((k) => k !== REDIRECT_URI_KEY),
    installationSecrets: [...strings(auth?.installationSecrets), ...strings(extra)].filter(
      (k) => k !== REDIRECT_URI_KEY,
    ),
    hasSetup: typeof auth?.setup === 'string' && auth.setup.length > 0,
  };
}

/**
 * The Station's operations.
 *
 * @spec STADMIN-REQ-5
 */
export class StationAdminApi {
  constructor(private readonly deps: StationAdminDeps) {}

  /** Answer one `/api/…` request. */
  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    url: string,
    caller: StationCaller,
  ): Promise<void> {
    const method = req.method ?? 'GET';
    const path = url.split('?')[0] ?? url;
    let body: Record<string, unknown> = {};
    try {
      if (method !== 'GET' && method !== 'DELETE') {
        const raw = await readBody(req);
        const parsed = raw ? JSON.parse(raw) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        body = parsed as Record<string, unknown>;
      }
    } catch {
      send(res, 400, { error: 'The body is not a JSON object', code: 'BAD_REQUEST' });
      return;
    }

    try {
      const answer = await this.route(method, path, body, caller);
      if (!answer) throw new Refusal(404, `Not found: ${method} ${path}`, 'NO_ROUTE');
      send(res, answer.status, answer.body);
    } catch (err) {
      if (err instanceof Refusal) {
        send(res, err.status, { error: err.message, code: err.code, ...err.extra });
        return;
      }
      // The message of an unexpected error is not echoed: it could carry a value read from a store.
      send(res, 500, { error: 'The Station failed to do this', code: 'INTERNAL' });
    }
  }

  private async route(
    method: string,
    path: string,
    body: Record<string, unknown>,
    caller: StationCaller,
  ): Promise<{ status: number; body: unknown } | undefined> {
    const ok = (value: unknown, status = 200) => ({ status, body: value });
    const part = (pattern: RegExp): string[] | undefined => {
      const match = path.match(pattern);
      return match ? match.slice(1).map((p) => decodeURIComponent(p)) : undefined;
    };
    let m: string[] | undefined;

    if (path === '/api/whoami' && method === 'GET') return ok(this.whoami(caller));

    // --- Apps -----------------------------------------------------------
    if (path === '/api/apps' && method === 'GET') return ok(await this.listApps(caller));
    if (path === '/api/apps' && method === 'POST') return ok(await this.addApp(caller, body), 201);
    m = part(/^\/api\/apps\/([^/]+)$/);
    if (m && method === 'DELETE') return ok(await this.removeApp(caller, m[0] as string));
    m = part(/^\/api\/apps\/([^/]+)\/secrets$/);
    if (m && method === 'GET') return ok(await this.systemSecretNames(caller, m[0] as string));
    if (m && method === 'PUT')
      return ok(await this.changeSystemSecrets(caller, m[0] as string, body));

    // --- Workspaces -----------------------------------------------------
    if (path === '/api/workspaces' && method === 'GET') {
      this.operator(caller);
      return ok({ workspaces: this.knownWorkspaces() });
    }
    if (path === '/api/workspaces' && method === 'POST')
      return ok(this.addWorkspace(caller, body), 201);

    // --- Installations --------------------------------------------------
    if (path === '/api/installations' && method === 'GET') {
      return ok({ installations: await this.describeInstallations(caller) });
    }
    if (path === '/api/installations' && method === 'POST') {
      return ok(await this.createInstallation(caller, body), 201);
    }
    m = part(/^\/api\/installations\/([^/]+)$/);
    if (m && method === 'GET') {
      const installation = this.owned(caller, m[0] as string);
      return ok(await this.describeInstallation(installation));
    }
    if (m && method === 'PATCH') return ok(this.changeInstallation(caller, m[0] as string, body));
    if (m && method === 'DELETE') return ok(await this.removeInstallation(caller, m[0] as string));
    m = part(/^\/api\/installations\/([^/]+)\/secrets$/);
    if (m && method === 'PUT') {
      return ok(await this.changeInstallationSecrets(caller, m[0] as string, body));
    }
    m = part(/^\/api\/installations\/([^/]+)\/bindings$/);
    if (m && method === 'GET') return ok({ bindings: this.bindingsOf(caller, m[0] as string) });
    m = part(/^\/api\/installations\/([^/]+)\/bindings\/([^/]+)$/);
    if (m && method === 'PUT') return ok(this.bind(caller, m[0] as string, m[1] as string, body));
    if (m && method === 'DELETE') return ok(this.unbind(caller, m[0] as string, m[1] as string));

    // --- API Keys -------------------------------------------------------
    if (path === '/api/keys' && method === 'GET') return ok({ keys: await this.listKeys(caller) });
    if (path === '/api/keys' && method === 'POST')
      return ok(await this.createKey(caller, body), 201);
    m = part(/^\/api\/keys\/([^/]+)$/);
    if (m && method === 'DELETE') return ok(await this.revokeKey(caller, m[0] as string));

    // --- Policies -------------------------------------------------------
    if (path === '/api/policies' && method === 'GET') {
      return ok({ policies: await this.listPolicies(caller) });
    }
    m = part(/^\/api\/policies\/([^/]+)$/);
    if (m && method === 'GET') return ok(await this.readPolicy(caller, m[0] as string));
    if (m && method === 'PUT') return ok(await this.writePolicy(caller, m[0] as string, body));
    if (m && method === 'DELETE') return ok(await this.deletePolicy(caller, m[0] as string));

    return undefined;
  }

  // -----------------------------------------------------------------------
  // Who may
  // -----------------------------------------------------------------------

  private operator(caller: StationCaller): void {
    if (!caller.operator) throw FORBIDDEN_OPERATOR();
  }

  /** The Workspace the caller owns. @spec STADMIN-REQ-1 */
  private ownerWorkspace(caller: StationCaller): string {
    if (!caller.owner || caller.workspaceId === null) throw FORBIDDEN_OWNER();
    return caller.workspaceId;
  }

  private whoami(caller: StationCaller): Record<string, unknown> {
    return {
      stationId: this.deps.stationId,
      principalId: caller.principalId,
      operator: caller.operator,
      owner: caller.owner,
      workspaceId: caller.workspaceId,
      role: caller.operator && caller.owner ? 'admin' : this.roleName(caller),
    };
  }

  private roleName(caller: StationCaller): ApiKeyRole {
    if (caller.operator) return 'station-operator';
    return caller.owner ? 'workspace-owner' : 'workspace-member';
  }

  // -----------------------------------------------------------------------
  // Installations and Workspaces, as the Station keeps them
  // -----------------------------------------------------------------------

  private allInstallations(): StationInstallation[] {
    const source = this.deps.installations;
    if (!source) return [];
    return typeof source === 'function' ? source() : source.list();
  }

  private store(): InstallationStore {
    const source = this.deps.installations;
    if (!source || typeof source === 'function') throw UNSUPPORTED('Installations');
    return source;
  }

  private workspaceOf(installation: StationInstallation): string {
    return installation.workspaceId ?? this.deps.homeWorkspaceId;
  }

  private knownWorkspaces(): string[] {
    return [this.deps.homeWorkspaceId, ...(this.deps.workspaces?.list() ?? [])];
  }

  /** An Installation of the Workspace the caller owns; anything else does not exist. */
  private owned(caller: StationCaller, installationId: string): StationInstallation {
    const workspaceId = this.ownerWorkspace(caller);
    const found = this.allInstallations().find(
      (i) =>
        (i.installationId === installationId || i.alias === installationId) &&
        this.workspaceOf(i) === workspaceId,
    );
    if (!found) throw NOT_FOUND('Installation');
    return found;
  }

  private app(appId: string): AppEntry | undefined {
    return this.deps.apps().find((a) => a.id === appId);
  }

  // -----------------------------------------------------------------------
  // Apps
  // -----------------------------------------------------------------------

  /** @spec STADMIN-REQ-9 */
  private async listApps(caller: StationCaller): Promise<{ apps: unknown[] }> {
    await this.deps.discover();
    const installations = this.allInstallations();
    const apps = [];
    for (const entry of this.deps.apps()) {
      const auth = authOf(entry);
      const item: Record<string, unknown> = {
        id: entry.id,
        name: entry.name ?? entry.id,
        version: entry.version,
        ...(entry.description ? { description: entry.description } : {}),
        auth,
      };
      if (caller.operator) {
        // STADMIN-REQ-4: which are set and which are missing, never their values.
        const set = Object.keys(
          await this.deps.secretStore.getSystemSecrets({
            stationId: this.deps.stationId,
            appId: entry.id,
          }),
        );
        item.systemSecretsMissing = auth.systemSecrets.filter((k) => !set.includes(k));
        item.installations = installations.filter((i) => i.appId === entry.id).length;
        const source = this.deps.appCatalog?.sourceOf?.(entry.id);
        if (source) item.source = source;
      }
      apps.push(item);
    }
    return { apps };
  }

  /** @spec STADMIN-REQ-9 */
  private async addApp(
    caller: StationCaller,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.operator(caller);
    if (!this.deps.appCatalog) throw UNSUPPORTED('a catalog Apps can be added to');
    const source = typeof body.source === 'string' ? body.source.trim() : '';
    if (!source) throw new Refusal(400, "Field 'source' is required", 'BAD_REQUEST');
    let entry: AppEntry;
    try {
      entry = await this.deps.appCatalog.add(source);
    } catch (err) {
      throw new Refusal(404, err instanceof Error ? err.message : 'App not found', 'APP_NOT_FOUND');
    }
    if (!this.app(entry.id)) await this.deps.addApp(entry);
    return { id: entry.id, name: entry.name ?? entry.id, version: entry.version };
  }

  /** @spec STADMIN-REQ-9 */
  private async removeApp(caller: StationCaller, appId: string): Promise<Record<string, unknown>> {
    this.operator(caller);
    if (!this.deps.appCatalog) throw UNSUPPORTED('a catalog Apps can be removed from');
    if (!this.app(appId)) throw NOT_FOUND('App');
    const count = this.allInstallations().filter((i) => i.appId === appId).length;
    if (count > 0) {
      throw new Refusal(
        409,
        `${appId} has ${count} Installation${count === 1 ? '' : 's'}; uninstall ${count === 1 ? 'it' : 'them'} first`,
        'APP_IN_USE',
        { installations: count },
      );
    }
    await this.deps.appCatalog.remove(appId);
    await this.deps.removeApp(appId);
    return { removed: appId };
  }

  /** @spec STADMIN-REQ-4 */
  private async systemSecretNames(
    caller: StationCaller,
    appId: string,
  ): Promise<Record<string, unknown>> {
    this.operator(caller);
    const entry = this.app(appId);
    if (!entry) throw NOT_FOUND('App');
    const declared = authOf(entry).systemSecrets;
    const set = Object.keys(
      await this.deps.secretStore.getSystemSecrets({ stationId: this.deps.stationId, appId }),
    );
    return {
      appId,
      declared,
      set: set.sort(),
      missing: declared.filter((k) => !set.includes(k)),
    };
  }

  /**
   * Set and remove system secrets of an App. A key that is set must be one
   * the App declares; any stored key may be removed, also one the App no
   * longer declares.
   *
   * @spec STADMIN-REQ-4
   * @spec STADMIN-REQ-10
   */
  private async changeSystemSecrets(
    caller: StationCaller,
    appId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.operator(caller);
    const entry = this.app(appId);
    if (!entry) throw NOT_FOUND('App');
    const scope = { stationId: this.deps.stationId, appId };
    const set = stringRecord(body.set);
    const unset = strings(body.unset);
    const expected = authOf(entry).systemSecrets;
    const unexpected = Object.keys(set).filter((k) => !expected.includes(k));
    if (unexpected.length > 0) {
      throw new Refusal(
        400,
        `Unexpected secret(s): ${unexpected.join(', ')}`,
        'UNEXPECTED_SECRET',
        {
          unexpected,
          expected,
        },
      );
    }
    if (Object.keys(set).length > 0) await this.deps.secretStore.setSystemSecrets(scope, set);
    const removed =
      unset.length > 0 ? await this.deps.secretStore.removeSystemSecrets(scope, unset) : [];
    return {
      appId,
      set: Object.keys(set),
      removed,
      notSet: unset.filter((k) => !removed.includes(k)),
    };
  }

  // -----------------------------------------------------------------------
  // Workspaces
  // -----------------------------------------------------------------------

  /**
   * Make a Workspace known to this Station. Its id is decided by whoever
   * creates the Workspace; the Station refuses one it already knows.
   *
   * @spec STADMIN-REQ-11
   */
  private addWorkspace(
    caller: StationCaller,
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    this.operator(caller);
    if (!this.deps.workspaces) throw UNSUPPORTED('more than one Workspace');
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id || /[\s/\\]/.test(id)) {
      throw new Refusal(400, "Field 'id' is required, with no spaces or slashes", 'BAD_REQUEST');
    }
    if (this.knownWorkspaces().includes(id)) {
      throw new Refusal(
        409,
        'This Station already knows a Workspace with that id',
        'WORKSPACE_EXISTS',
      );
    }
    this.deps.workspaces.add(id);
    return { id };
  }

  // -----------------------------------------------------------------------
  // Installations
  // -----------------------------------------------------------------------

  private async describeInstallation(
    installation: StationInstallation,
  ): Promise<Record<string, unknown>> {
    const entry = this.app(installation.appId);
    const base = {
      installationId: installation.installationId,
      alias: installation.alias,
      appId: installation.appId,
      ...(installation.installedAt ? { installedAt: installation.installedAt } : {}),
      permissions: installation.permissions ?? {},
    };
    if (!entry) return { ...base, available: false };

    const auth = authOf(entry);
    const scope = {
      stationId: this.deps.stationId,
      workspaceId: this.workspaceOf(installation),
      installationId: installation.installationId,
    };
    const system = Object.keys(
      await this.deps.secretStore.getSystemSecrets({
        stationId: this.deps.stationId,
        appId: entry.id,
      }),
    );
    const own = Object.keys(await this.deps.secretStore.getInstallationSecrets(scope));
    const missingSystem = auth.systemSecrets.filter((k) => !system.includes(k));
    let status: Record<string, unknown>;
    if (auth.type === 'none') {
      status = { kind: 'none', authenticated: true };
    } else if (auth.type === 'api-key') {
      const missingOwn = auth.installationSecrets.filter((k) => !own.includes(k));
      status = {
        kind: 'api-key',
        authenticated: missingSystem.length === 0 && missingOwn.length === 0,
        missingSecrets: missingSystem,
        missingUserSecrets: missingOwn,
      };
    } else {
      status = {
        kind: auth.type,
        ...(await this.deps.authStatus(installation)),
        missingSecrets: missingSystem,
      };
    }
    return {
      ...base,
      available: true,
      name: entry.name ?? entry.id,
      version: entry.version,
      declaredSecrets: auth.installationSecrets,
      setSecrets: own.sort(),
      auth: status,
    };
  }

  private async describeInstallations(caller: StationCaller): Promise<unknown[]> {
    const workspaceId = this.ownerWorkspace(caller);
    await this.deps.discover();
    const mine = this.allInstallations().filter((i) => this.workspaceOf(i) === workspaceId);
    return Promise.all(mine.map((i) => this.describeInstallation(i)));
  }

  /**
   * Install an available App in the caller's Workspace. An App that is not
   * available is never added here: the Station Operator adds it first.
   *
   * @spec STADMIN-REQ-9
   */
  private async createInstallation(
    caller: StationCaller,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const workspaceId = this.ownerWorkspace(caller);
    const store = this.store();
    const appId = typeof body.appId === 'string' ? body.appId : '';
    const alias = typeof body.alias === 'string' ? body.alias.trim() : '';
    if (!appId || !alias) {
      throw new Refusal(400, "Fields 'appId' and 'alias' are required", 'BAD_REQUEST');
    }
    await this.deps.discover();
    if (!this.app(appId)) {
      // DIST-REQ-3: an App that is listed but was never downloaded is made ready;
      // one that is not listed is never added here.
      let prepared: AppEntry | undefined;
      try {
        prepared = await this.deps.appCatalog?.prepare?.(appId);
      } catch (err) {
        throw new Refusal(
          502,
          err instanceof Error ? err.message : `Could not download ${appId}`,
          'APP_DOWNLOAD_FAILED',
        );
      }
      if (prepared && !this.app(prepared.id)) await this.deps.addApp(prepared);
    }
    if (!this.app(appId)) {
      throw new Refusal(
        404,
        `${appId} is not available on this Station; the Station Operator has to add it`,
        'APP_NOT_AVAILABLE',
        { appId, operator: caller.operator },
      );
    }
    const taken = this.allInstallations().find(
      (i) => i.alias === alias && this.workspaceOf(i) === workspaceId,
    );
    if (taken) {
      throw new Refusal(409, `Alias "${alias}" is already used by ${taken.appId}`, 'ALIAS_TAKEN');
    }
    const permissions =
      body.permissions && typeof body.permissions === 'object' && !Array.isArray(body.permissions)
        ? (body.permissions as Record<string, unknown>)
        : undefined;
    const installation: StationInstallation = {
      installationId: generateInstallationId(),
      alias,
      appId,
      ...(workspaceId === this.deps.homeWorkspaceId ? {} : { workspaceId }),
      installedAt: new Date().toISOString(),
      ...(permissions && Object.keys(permissions).length > 0 ? { permissions } : {}),
    };
    store.create(installation);
    return this.describeInstallation(installation);
  }

  /** Rename an Installation or record the Permissions its Approver approved. */
  private changeInstallation(
    caller: StationCaller,
    installationId: string,
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    const installation = this.owned(caller, installationId);
    const store = this.store();
    const patch: { alias?: string; permissions?: Record<string, unknown> } = {};
    if (typeof body.alias === 'string') {
      const alias = body.alias.trim();
      if (!alias) throw new Refusal(400, "Field 'alias' must not be empty", 'BAD_REQUEST');
      const taken = this.allInstallations().find(
        (i) =>
          i.alias === alias &&
          i.installationId !== installation.installationId &&
          this.workspaceOf(i) === this.workspaceOf(installation),
      );
      if (taken) {
        throw new Refusal(409, `Alias "${alias}" is already used by ${taken.appId}`, 'ALIAS_TAKEN');
      }
      patch.alias = alias;
    }
    if (
      body.permissions &&
      typeof body.permissions === 'object' &&
      !Array.isArray(body.permissions)
    ) {
      patch.permissions = body.permissions as Record<string, unknown>;
    }
    store.update(installation.installationId, patch);
    return {
      installationId: installation.installationId,
      alias: patch.alias ?? installation.alias,
      appId: installation.appId,
      permissions: patch.permissions ?? installation.permissions ?? {},
    };
  }

  /** Remove an Installation with its secrets and its Bindings. */
  private async removeInstallation(
    caller: StationCaller,
    installationId: string,
  ): Promise<Record<string, unknown>> {
    const installation = this.owned(caller, installationId);
    const store = this.store();
    const scope = {
      stationId: this.deps.stationId,
      workspaceId: this.workspaceOf(installation),
      installationId: installation.installationId,
    };
    const stored = Object.keys(await this.deps.secretStore.getInstallationSecrets(scope));
    if (stored.length > 0) await this.deps.secretStore.removeInstallationSecrets(scope, stored);
    this.deps.bindings?.removeAllFor(installation.installationId);
    store.remove(installation.installationId);
    return { removed: installation.installationId, alias: installation.alias };
  }

  /**
   * Set, remove or clear the secrets of an Installation. A key that is set
   * must be one the App declares; any stored key may be removed.
   *
   * @spec STADMIN-REQ-10
   */
  private async changeInstallationSecrets(
    caller: StationCaller,
    installationId: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const installation = this.owned(caller, installationId);
    const scope = {
      stationId: this.deps.stationId,
      workspaceId: this.workspaceOf(installation),
      installationId: installation.installationId,
    };
    const set = stringRecord(body.set);
    const entry = this.app(installation.appId);
    const expected = entry ? authOf(entry).installationSecrets : [];
    const unexpected = Object.keys(set).filter((k) => !expected.includes(k));
    if (unexpected.length > 0) {
      throw new Refusal(
        400,
        `Unexpected secret(s): ${unexpected.join(', ')}`,
        'UNEXPECTED_SECRET',
        {
          unexpected,
          expected,
        },
      );
    }
    const stored = Object.keys(await this.deps.secretStore.getInstallationSecrets(scope));
    const unset = body.clear === true ? stored : strings(body.unset);
    if (Object.keys(set).length > 0) await this.deps.secretStore.setInstallationSecrets(scope, set);
    const removed =
      unset.length > 0 ? await this.deps.secretStore.removeInstallationSecrets(scope, unset) : [];
    return {
      installationId: installation.installationId,
      alias: installation.alias,
      set: Object.keys(set),
      removed,
      notSet: unset.filter((k) => !removed.includes(k)),
    };
  }

  // -----------------------------------------------------------------------
  // Bindings
  // -----------------------------------------------------------------------

  private bindingsOf(caller: StationCaller, installationId: string): unknown[] {
    const installation = this.owned(caller, installationId);
    if (!this.deps.bindings) throw UNSUPPORTED('Bindings');
    const all = this.allInstallations();
    return this.deps.bindings
      .list()
      .filter((b) => b.installationId === installation.installationId)
      .map((b) => ({
        ...b,
        targetAlias: all.find((i) => i.installationId === b.targetInstallationId)?.alias,
      }));
  }

  private bind(
    caller: StationCaller,
    installationId: string,
    bindingName: string,
    body: Record<string, unknown>,
  ): Record<string, unknown> {
    const installation = this.owned(caller, installationId);
    if (!this.deps.bindings) throw UNSUPPORTED('Bindings');
    const target = this.owned(caller, typeof body.target === 'string' ? body.target : '');
    const binding = {
      installationId: installation.installationId,
      bindingName,
      targetInstallationId: target.installationId,
      boundAt: new Date().toISOString(),
    };
    this.deps.bindings.set(binding);
    return { ...binding, targetAlias: target.alias };
  }

  private unbind(
    caller: StationCaller,
    installationId: string,
    bindingName: string,
  ): Record<string, unknown> {
    const installation = this.owned(caller, installationId);
    if (!this.deps.bindings) throw UNSUPPORTED('Bindings');
    return { removed: this.deps.bindings.remove(installation.installationId, bindingName) };
  }

  // -----------------------------------------------------------------------
  // API Keys
  // -----------------------------------------------------------------------

  private keys(): ApiKeyStore {
    if (!this.deps.apiKeys) throw UNSUPPORTED('API Keys');
    return this.deps.apiKeys;
  }

  private static roleOf(key: ApiKeyRecord): ApiKeyRole {
    return key.role ?? 'workspace-member';
  }

  private keyWorkspace(key: ApiKeyRecord): string | null {
    return StationAdminApi.roleOf(key) === 'station-operator'
      ? null
      : (key.workspaceId ?? this.deps.homeWorkspaceId);
  }

  /**
   * Whether the caller manages a key: an Owner its Workspace's Members', the
   * Station Operator those of Operators and Owners.
   */
  private manages(caller: StationCaller, key: ApiKeyRecord): boolean {
    const role = StationAdminApi.roleOf(key);
    if (role !== 'workspace-member') return caller.operator;
    return caller.owner && this.keyWorkspace(key) === caller.workspaceId;
  }

  /** @spec STADMIN-REQ-8 */
  private async listKeys(caller: StationCaller): Promise<unknown[]> {
    if (!caller.owner && !caller.operator) throw FORBIDDEN_OWNER();
    const keys = await this.keys().list();
    return keys
      .filter((k) => this.manages(caller, k))
      .map(({ keyHash: _hash, ...key }) => ({
        ...key,
        role: StationAdminApi.roleOf(key as ApiKeyRecord),
        workspaceId: this.keyWorkspace(key as ApiKeyRecord),
      }));
  }

  /**
   * Create an API Key with a role. Only the Station Operator creates an
   * Operator's or an Owner's; an Owner creates its Members'.
   *
   * @spec STADMIN-REQ-8
   */
  private async createKey(
    caller: StationCaller,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const role = (body.role ?? 'workspace-member') as ApiKeyRole;
    if (!API_KEY_ROLES.includes(role)) {
      throw new Refusal(
        400,
        `Field 'role' must be one of ${API_KEY_ROLES.join(', ')}`,
        'BAD_REQUEST',
      );
    }
    let workspaceId: string | null;
    if (role === 'workspace-member') {
      workspaceId = this.ownerWorkspace(caller);
    } else {
      this.operator(caller);
      workspaceId =
        role === 'station-operator'
          ? null
          : typeof body.workspaceId === 'string'
            ? body.workspaceId
            : (caller.workspaceId ?? '');
      if (workspaceId !== null && !this.knownWorkspaces().includes(workspaceId)) {
        throw new Refusal(400, 'This Station does not know that Workspace', 'UNKNOWN_WORKSPACE');
      }
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!name || !userId) {
      throw new Refusal(400, "Fields 'name' and 'userId' are required", 'BAD_REQUEST');
    }
    // POLICY-REQ-15: a name is unique among the active keys of a Workspace.
    const taken = (await this.keys().list()).find(
      (k) => k.name === name && !k.revokedAt && this.keyWorkspace(k) === workspaceId,
    );
    if (taken) {
      throw new Refusal(
        409,
        `An active API key is already named ${name} (${taken.id})`,
        'NAME_TAKEN',
      );
    }

    const { raw, hash, prefix } = generateApiKey();
    const now = new Date().toISOString();
    const id = `ak_${randomBytes(8).toString('hex')}`;
    const record: ApiKeyRecord = {
      id,
      name,
      keyHash: hash,
      prefix,
      identity: { userId },
      // POLICY-REQ-1: each key is its own Principal, with the default Policy.
      principalId: id,
      createdAt: now,
      updatedAt: now,
      ...(typeof body.expiresAt === 'string' ? { expiresAt: body.expiresAt } : {}),
      ...(role === 'workspace-member' ? {} : { role }),
      ...(workspaceId !== null && workspaceId !== this.deps.homeWorkspaceId ? { workspaceId } : {}),
    };
    await this.keys().create(record);
    const { keyHash: _hash, ...shown } = record;
    // The raw key is answered this once and never again.
    return { ...shown, role, workspaceId, key: raw };
  }

  private async revokeKey(caller: StationCaller, id: string): Promise<Record<string, unknown>> {
    if (!caller.owner && !caller.operator) throw FORBIDDEN_OWNER();
    const key = (await this.keys().list()).find((k) => k.id === id || k.name === id);
    if (!key || key.revokedAt || !this.manages(caller, key)) throw NOT_FOUND('API key');
    await this.keys().revoke(key.id);
    return { revoked: true, id: key.id, name: key.name };
  }

  // -----------------------------------------------------------------------
  // Policies
  // -----------------------------------------------------------------------

  private policies(): PolicyStore {
    if (!this.deps.policies) throw UNSUPPORTED('Policies');
    return this.deps.policies;
  }

  /** The Principals of a Workspace: its active keys', and `admin` in the home one. */
  private async principalsOf(workspaceId: string): Promise<Map<string, string>> {
    const principals = new Map<string, string>();
    if (workspaceId === this.deps.homeWorkspaceId) principals.set(ADMIN_PRINCIPAL_ID, 'admin');
    for (const key of this.deps.apiKeys ? await this.deps.apiKeys.list() : []) {
      if (!key.revokedAt && this.keyWorkspace(key) === workspaceId) {
        principals.set(key.principalId, key.name);
      }
    }
    return principals;
  }

  /**
   * The Principal a name or an id stands for, among those of the caller's
   * Workspace. A Rule is never kept for one that does not exist (POLICY-REQ-15).
   */
  private async principal(caller: StationCaller, nameOrId: string): Promise<string> {
    const principals = await this.principalsOf(this.ownerWorkspace(caller));
    if (principals.has(nameOrId)) return nameOrId;
    for (const [id, name] of principals) if (name === nameOrId) return id;
    throw NOT_FOUND('Principal');
  }

  private async listPolicies(caller: StationCaller): Promise<unknown[]> {
    const principals = await this.principalsOf(this.ownerWorkspace(caller));
    const store = this.policies();
    const result = [];
    for (const [principalId, name] of principals) {
      const stored = await store.get(principalId);
      result.push({ ...(await policyFor(store, principalId)), name, stored: stored !== null });
    }
    return result;
  }

  private async readPolicy(caller: StationCaller, nameOrId: string): Promise<Policy> {
    return policyFor(this.policies(), await this.principal(caller, nameOrId));
  }

  private async writePolicy(
    caller: StationCaller,
    nameOrId: string,
    body: Record<string, unknown>,
  ): Promise<Policy> {
    const principalId = await this.principal(caller, nameOrId);
    const current = await policyFor(this.policies(), principalId);
    if (body.rules !== undefined && !Array.isArray(body.rules)) {
      throw new Refusal(400, "Field 'rules' must be a list of Rules", 'BAD_REQUEST');
    }
    const policy: Policy = {
      ...current,
      ...(Array.isArray(body.rules) ? { rules: body.rules as Policy['rules'] } : {}),
      ...(typeof body.defaultEffect === 'string'
        ? { defaultEffect: body.defaultEffect as Policy['defaultEffect'] }
        : {}),
      principalId,
      updatedAt: new Date().toISOString(),
    };
    await this.policies().put(policy);
    return policy;
  }

  private async deletePolicy(
    caller: StationCaller,
    nameOrId: string,
  ): Promise<Record<string, unknown>> {
    const principalId = await this.principal(caller, nameOrId);
    return { removed: await this.policies().remove(principalId), principalId };
  }
}
