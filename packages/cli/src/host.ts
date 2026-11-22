/**
 * @agentapps/cli — real host implementation for local development.
 *
 * Resolves system/installation secrets and auth from local files. This is intentionally
 * a development host; production hosts should plug in their own secret store
 * and OAuth infrastructure.
 */

import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { RequestHandlers } from '@agentapps/host';
import {
  FileDocumentStore,
  handleVolumeRequest,
  ObjectStore,
  toObjectInfo,
} from '@agentapps/station';
import { workspaceDataPath, workspaceStationSecret } from './data-paths.js';
import { BOLD, CYAN, GREEN, RESET } from './render/colors.js';
import { loadAppSecrets, writeSecretFile } from './secrets-store.js';
import type { AppConfigEntry, ResolvedApp } from './types.js';

const INSTALLATION_SECRETS_DIR = '.agentapps';
const INSTALLATION_SECRETS_FILE = 'installation-secrets.json';
/** Local data directory for the Volume and Objects (NOT secrets). */
const DATA_DIR = '.agentapps/data';

/**
 * Where the workspace keeps every Installation's Storage on disk. The CLI and
 * the station started by `serve` both use it, so they see the same data.
 *
 * @spec CLI-REQ-3
 */
export function workspaceStoragePath(configPath: string): string {
  return resolve(dirname(resolve(configPath)), DATA_DIR, 'storage');
}

/** Context needed to build host requests for an app. */
export interface HostContext {
  app: ResolvedApp;
  appEntry: AppConfigEntry;
  configPath: string;
  /** Unique installation ID for per-installation secrets. If omitted, falls back to the legacy global store. */
  installationId?: string;
  /**
   * Station port for building signed URLs in object storage.
   * When provided, signed URLs use `http://localhost:<port>` as the base.
   * Falls back to `http://localhost:4100` if neither this nor `publicUrl` is set.
   */
  stationPort?: number;
  /**
   * Public base URL for building signed URLs (overrides stationPort).
   * e.g. `http://127.0.0.1:4100` or a production URL.
   */
  publicUrl?: string;
  /**
   * The Installation's Effective Permissions. `volume` gates every
   * `file_volume_*` Request (VOL-REQ-2).
   */
  permissions?: { volume?: boolean };
}

export function createCliHostRequestHandlers(ctx: HostContext): RequestHandlers {
  const systemSecrets = loadSystemSecrets(ctx);
  const installationSecretsStore = new InstallationSecretsStore(ctx.configPath, ctx.installationId);
  const authConfig = getAuthConfig(ctx);
  // Storage: one JSON file per installation and collection under the data dir.
  const documentStore = new FileDocumentStore(workspaceStoragePath(ctx.configPath));
  const storageInstallation = ctx.installationId ?? '_default';
  // CLI-REQ-14: the same directory and signing secret as the Station this CLI starts.
  const volumesBasePath = workspaceDataPath(ctx.configPath);
  const publicUrl =
    ctx.publicUrl ??
    (ctx.stationPort ? `http://localhost:${ctx.stationPort}` : 'http://localhost:4100');
  // Objects live next to the Volume under the local data directory; URLs point
  // at the Station, which serves GET /objects/{id} from the same directory.
  const objectStore = new ObjectStore({
    volumesBasePath,
    stationSecret: workspaceStationSecret(ctx.configPath),
    publicUrl,
  });
  const objectScope = (installationId: string) => ({
    workspaceId: 'default',
    installationId,
  });

  // Installation ID for storage scoping. Falls back to configPath for backwards compat.
  const installationId = ctx.installationId ?? ctx.configPath;

  return {
    onGetSystemSecrets: async () => systemSecrets,
    onGetInstallationSecrets: async () => {
      const secrets = installationSecretsStore.read();
      // Refresh an expired OAuth access token before serving it. Apps expect the
      // backend to hand them a fresh token (the refresh_token stays server-side);
      // in production the host does this, so the local host must too — otherwise
      // every Google app breaks ~1h after connecting.
      const expiryMs = secrets.EXPIRY_DATE ? Date.parse(secrets.EXPIRY_DATE) : Number.NaN;
      const expired = Number.isFinite(expiryMs) && expiryMs <= Date.now() + 60_000; // 60s skew
      if (expired && secrets.REFRESH_TOKEN) {
        try {
          const refreshed = await refreshToken(systemSecrets, installationSecretsStore, authConfig);
          // refreshToken persists ACCESS_TOKEN/REFRESH_TOKEN; also update
          // EXPIRY_DATE (the field the stored token uses) so we don't refresh on
          // every call.
          if (refreshed.expiresAt)
            installationSecretsStore.merge({ EXPIRY_DATE: refreshed.expiresAt });
          return installationSecretsStore.read();
        } catch {
          // Serve the stale secrets; the tool call surfaces the auth error.
          return secrets;
        }
      }
      return secrets;
    },
    onUpdateInstallationSecrets: async (_sessionId, _requestId, secrets) => {
      installationSecretsStore.merge(secrets);
      return true;
    },
    onAuthUrl: async (_sessionId, _requestId, provider, scopes) => {
      return buildAuthUrl(provider, scopes, systemSecrets, undefined, authConfig);
    },
    onAuthStatus: async (_sessionId, _requestId) => {
      return getAuthStatus(ctx, systemSecrets, installationSecretsStore);
    },
    onRefreshToken: async () => {
      return refreshToken(systemSecrets, installationSecretsStore, authConfig);
    },
    onOpenUrl: async (_sessionId, _requestId, url, title) => {
      return openUrl(url, title);
    },
    onRequestSecret: async (_sessionId, _requestId, name, description) => {
      return requestSecret(name, description);
    },
    onGetUserProfile: async () => {
      // Return a dev-mode profile from the environment or a default.
      return {
        userId: process.env.AGENTAPPS_USER_ID ?? 'dev-user',
        displayName: process.env.AGENTAPPS_USER_NAME ?? 'Dev User',
        locale: process.env.AGENTAPPS_USER_LOCALE ?? 'en-US',
        timezone: process.env.AGENTAPPS_USER_TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        email: process.env.AGENTAPPS_USER_EMAIL,
        avatarUrl: process.env.AGENTAPPS_USER_AVATAR,
      };
    },
    onIntentCall: async (_sessionId, _requestId, binding, tool, args) => {
      // CLI stub — intent routing across apps requires multi-session management
      // which is host-platform responsibility (plan item 4.2). Log the call for
      // development visibility.
      console.error(
        `[cli] Intent call: ${binding}.${tool}(${JSON.stringify(args)}) — not routed (CLI dev mode)`,
      );
      return {
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: `Intent routing is not available in CLI dev mode. Binding '${binding}' tool '${tool}' was called but cannot be routed.`,
        },
        duration: 0,
      };
    },
    onStoragePut: async (_sessionId, _installationId, collection, documentId, document) => {
      await documentStore.put(storageInstallation, collection, documentId, document);
      return true;
    },
    onStorageGet: async (_sessionId, _installationId, collection, documentId) => {
      return documentStore.get(storageInstallation, collection, documentId);
    },
    onStorageQuery: async (_sessionId, _installationId, collection, query) => {
      return documentStore.query(storageInstallation, collection, query);
    },
    onStorageUpdate: async (_sessionId, _installationId, collection, documentId, patch) => {
      return documentStore.update(storageInstallation, collection, documentId, patch);
    },
    onStorageDelete: async (_sessionId, _installationId, collection, documentId) => {
      return documentStore.delete(storageInstallation, collection, documentId);
    },

    // -----------------------------------------------------------------------
    // Objects (object_put / object_get / object_delete / object_list / object_link)
    // -----------------------------------------------------------------------
    onObjectPut: async (_sessionId, installationId, object) => {
      const meta = await objectStore.put(objectScope(installationId), object.data, {
        contentType: object.contentType,
        filename: object.filename,
        visibility: object.visibility,
        metadata: object.metadata,
      });
      return toObjectInfo(meta);
    },
    onObjectGet: async (_sessionId, installationId, objectId) => {
      const found = await objectStore.get(objectScope(installationId), objectId);
      return found ? { ...toObjectInfo(found.meta), data: found.data } : null;
    },
    onObjectDelete: async (_sessionId, installationId, objectId) => {
      return objectStore.delete(objectScope(installationId), objectId);
    },
    onObjectList: async (_sessionId, installationId, options) => {
      const page = await objectStore.list(objectScope(installationId), options);
      return {
        objects: page.objects.map(toObjectInfo),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    },
    onObjectLink: async (_sessionId, installationId, objectId, expiresIn) => {
      return objectStore.link(objectScope(installationId), objectId, expiresIn);
    },

    // -----------------------------------------------------------------------
    // Volume requests (file_volume_*): the Workspace Volume in API mode,
    // answered by the Station's handler on the same directory the Station
    // mounts (VOL-REQ-1, VOL-REQ-3, VOL-REQ-6), gated by the Installation's
    // `volume` Permission (VOL-REQ-2). The CLI Host has one Workspace.
    // -----------------------------------------------------------------------
    onFileRequest: async (sessionId, msg) =>
      (await handleVolumeRequest(
        { volumesBasePath, workspaceId: 'default', sessionId, permissions: ctx.permissions },
        msg,
      )) ?? {
        type: `${msg.type as string}_result`,
        sessionId,
        requestId: msg.requestId,
        success: false,
        error: `Unknown volume request: ${msg.type as string}`,
      },
  };
}
/** Read the auth section from the app manifest. */
function getAuthConfig(ctx: HostContext): Record<string, unknown> | undefined {
  return ctx.app.manifest?.auth as Record<string, unknown> | undefined;
}

/** Load system secrets from `.secrets/apps/<appId>.json`. */
function loadSystemSecrets(ctx: HostContext): Record<string, string> {
  const appId = (ctx.app.manifest?.id as string) ?? ctx.app.name;
  return loadAppSecrets(ctx.configPath, appId);
}

/** Local file-backed store for installation secrets. */
export class InstallationSecretsStore {
  private readonly path: string;

  constructor(configPath: string, installationId?: string) {
    const configDir = dirname(resolve(configPath));
    if (installationId) {
      this.path = resolve(
        configDir,
        INSTALLATION_SECRETS_DIR,
        'installation-secrets',
        `${installationId}.json`,
      );
    } else {
      this.path = resolve(configDir, INSTALLATION_SECRETS_DIR, INSTALLATION_SECRETS_FILE);
    }
  }

  read(): Record<string, string> {
    if (!existsSync(this.path)) return {};
    try {
      const raw = readFileSync(this.path, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') result[key] = value;
      }
      return result;
    } catch {
      return {};
    }
  }

  merge(secrets: Record<string, string>): void {
    const current = this.read();
    const next = { ...current, ...secrets };
    mkdirSync(dirname(this.path), { recursive: true });
    writeSecretFile(this.path, next);
  }

  /** Delete all stored installation secrets (e.g. OAuth tokens on logout). */
  clear(): boolean {
    if (!existsSync(this.path)) return false;
    rmSync(this.path);
    return true;
  }
}

/**
 * Exchange a stored refresh token for a new access token.
 *
 * Uses the provider's `tokenUrl` and `CLIENT_SECRET` from system secrets, plus
 * the user's `REFRESH_TOKEN` from the local installation-secrets store. Persists the
 * returned `ACCESS_TOKEN`, refreshed `REFRESH_TOKEN` (if provided), and
 * `expiresAt` back to the store.
 */
async function refreshToken(
  systemSecrets: Record<string, string>,
  installationSecretsStore: InstallationSecretsStore,
  authConfig?: Record<string, unknown>,
): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string }> {
  const tokenUrl =
    systemSecrets.tokenUrl ??
    (typeof authConfig?.tokenUrl === 'string' ? authConfig.tokenUrl : undefined);
  if (!tokenUrl) {
    throw new Error('Missing system secret: tokenUrl');
  }
  const clientId = systemSecrets.CLIENT_ID;
  if (!clientId) {
    throw new Error('Missing system secret: CLIENT_ID');
  }
  const clientSecret = systemSecrets.CLIENT_SECRET;
  if (!clientSecret) {
    throw new Error('Missing system secret: CLIENT_SECRET');
  }

  const installationSecrets = installationSecretsStore.read();
  const refreshTokenValue = installationSecrets.REFRESH_TOKEN;
  if (!refreshTokenValue) {
    throw new Error('Missing Installation secret: REFRESH_TOKEN');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshTokenValue,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown error');
    throw new Error(`Token refresh failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const accessToken = data.access_token as string | undefined;
  if (!accessToken) {
    throw new Error('Token refresh response missing access_token');
  }

  const newRefreshToken = (data.refresh_token as string | undefined) ?? refreshTokenValue;
  const expiresIn = data.expires_in as number | undefined;
  const expiresAt =
    typeof expiresIn === 'number'
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : undefined;

  const secretsToPersist: Record<string, string> = { ACCESS_TOKEN: accessToken };
  if (newRefreshToken) secretsToPersist.REFRESH_TOKEN = newRefreshToken;
  if (expiresAt) secretsToPersist.expiresAt = expiresAt;

  installationSecretsStore.merge(secretsToPersist);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresAt,
  };
}

/**
 * Resolve the current authentication status from stored installation secrets.
 *
 * Returns `authenticated: true` when a non-expired `ACCESS_TOKEN` is present.
 * When the token is missing or expired, returns `authRequired: true` so the
 * caller can initiate the OAuth flow. Extra metadata (`provider`, `scopes`,
 * `expiresAt`, `authUrl`) is included when available from the app manifest or
 * the stored secrets.
 */
function getAuthStatus(
  ctx: HostContext,
  systemSecrets: Record<string, string>,
  installationSecretsStore: InstallationSecretsStore,
): {
  authenticated: boolean;
  provider?: string;
  scopes?: string[];
  expiresAt?: string;
  authRequired?: boolean;
  authUrl?: string;
} {
  const installationSecrets = installationSecretsStore.read();
  const accessToken = installationSecrets.ACCESS_TOKEN;
  const expiresAt = installationSecrets.expiresAt;

  const auth = ctx.app.manifest?.auth as Record<string, unknown> | undefined;
  const provider = typeof auth?.provider === 'string' ? auth.provider : undefined;
  const scopes = Array.isArray(auth?.scopes) ? (auth.scopes as string[]) : undefined;

  const expired =
    typeof expiresAt === 'string' &&
    !Number.isNaN(Date.parse(expiresAt)) &&
    Date.parse(expiresAt) <= Date.now();

  // A stored refresh token means we can mint a fresh access token on demand,
  // so an expired (or missing) access token is NOT a reason to require re-auth.
  // The actual refresh happens lazily during the tool call via ctx.auth.refresh()
  // (host onRefreshToken), keeping refresh logic centralized in the host.
  const canRefresh = !!installationSecrets.REFRESH_TOKEN;

  if ((!accessToken || expired) && !canRefresh) {
    const result: ReturnType<typeof getAuthStatus> = {
      authenticated: false,
      authRequired: true,
    };
    if (provider) result.provider = provider;
    if (scopes) result.scopes = scopes;
    if (expiresAt) result.expiresAt = expiresAt;
    if (provider) {
      const { url } = buildAuthUrl(provider, scopes, systemSecrets);
      if (url) result.authUrl = url;
    }
    return result;
  }

  const result: ReturnType<typeof getAuthStatus> = {
    authenticated: true,
  };
  if (provider) result.provider = provider;
  if (scopes) result.scopes = scopes;
  if (expiresAt) result.expiresAt = expiresAt;
  return result;
}

/** Build an OAuth authorization URL or a GitHub App setup URL. */
export function buildAuthUrl(
  provider: string,
  scopes: string[] | undefined,
  systemSecrets: Record<string, string>,
  redirectUri?: string,
  authConfig?: Record<string, unknown>,
  fixedState?: string,
): { url: string; state: string } {
  // When a state is supplied (e.g. by requestAuthCode, which also arms the
  // request server with it), reuse it so the URL and the server agree —
  // otherwise the OAuth provider's callback would fail state validation.
  const state = fixedState ?? randomBytes(16).toString('hex');
  const upperProvider = provider.toUpperCase();

  // GitHub App: generate a setup URL and persist INSTALLATION_ID expectation.
  if (upperProvider === 'GITHUB') {
    const clientId = systemSecrets.GITHUB_APP_ID ?? systemSecrets.CLIENT_ID;
    if (!clientId) {
      return {
        url: '',
        state,
      };
    }
    const url = new URL(`https://github.com/apps/${clientId}/installations/new`);
    if (scopes && scopes.length > 0) {
      url.searchParams.set('state', state);
    }
    return { url: url.toString(), state };
  }

  // Generic OAuth2: build a URL from configured endpoints if available.
  // The manifest's auth.authorizeUrl/auth.tokenUrl take precedence when present,
  // falling back to system secrets for provider-specific overrides.
  const authorizeUrl =
    systemSecrets[`${upperProvider}_AUTHORIZE_URL`] ??
    (typeof authConfig?.authorizeUrl === 'string' ? authConfig.authorizeUrl : undefined);
  const clientId = systemSecrets[`${upperProvider}_CLIENT_ID`] ?? systemSecrets.CLIENT_ID;
  if (!authorizeUrl || !clientId) {
    return { url: '', state };
  }

  const url = new URL(authorizeUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', redirectUri ?? 'http://localhost:0/callback');
  if (scopes && scopes.length > 0) {
    url.searchParams.set('scope', scopes.join(' '));
  }
  // Google only returns a refresh token when offline access and an explicit
  // consent prompt are requested.
  if (upperProvider === 'GOOGLE') {
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
  }
  return { url: url.toString(), state };
}

/**
 * Read a single line from stdin, trimming whitespace.
 *
 * Exported for tests so they can inject a fake input stream. In production
 * callers pass `process.stdin` as the input.
 */
export function readLine(input: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input });
    let received = false;
    rl.once('line', (line) => {
      received = true;
      rl.close();
      resolve(line.trim());
    });
    rl.once('close', () => {
      // If the stream closes without emitting a line, resolve empty so the
      // caller can decide whether to retry or error.
      if (!received) resolve('');
    });
  });
}

/** Internal wrapper around execFile so tests can substitute the launch mechanism. */
export async function execOpenUrl(command: string, url: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    // Windows needs the shell so `start` is resolved; macOS/Linux launchers
    // work fine as direct executables and avoid Node's DEP0190 warning.
    execFile(command, [url], { shell: command === 'start' }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Whether this machine can open a graphical browser.
 *
 * macOS and Windows always can; on Linux a display server must be reachable
 * (headless servers and SSH sessions without X forwarding have neither).
 */
export function canOpenBrowser(): boolean {
  const platformName = platform();
  if (platformName === 'win32' || platformName === 'darwin') return true;
  return !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

/** Highlight a URL for terminal output (no-op when stderr is not a TTY). */
export function highlightUrl(url: string): string {
  const useColor = !!process.stderr.isTTY && !process.env.NO_COLOR;
  return useColor ? `${BOLD}${CYAN}${url}${RESET}` : url;
}

/**
 * Open a URL in the user's default browser/client.
 *
 * The URL is always printed exactly once, in a highlighted block, so the user
 * can copy it — the browser launch may silently land on another display, and
 * on remote/headless machines it is skipped entirely.
 */
export async function openUrl(
  url: string,
  title?: string,
  launcher: (command: string, url: string) => Promise<void> = execOpenUrl,
  browserAvailable: boolean = canOpenBrowser(),
): Promise<void> {
  if (title) {
    console.error(`[cli] ${title}`);
  }

  if (!browserAvailable) {
    console.error('[cli] No browser available on this machine — open this URL from any device:');
    console.error('');
    console.error(`  ${highlightUrl(url)}`);
    console.error('');
    return;
  }

  console.error('[cli] Opening your browser to continue:');
  console.error('');
  console.error(`  ${highlightUrl(url)}`);
  console.error('');

  const platformName = platform();
  const command =
    platformName === 'win32' ? 'start' : platformName === 'darwin' ? 'open' : 'xdg-open';

  try {
    await launcher(command, url);
  } catch {
    // Non-fatal: the user can still copy the URL printed above.
    console.error('[cli] Could not open the browser automatically — use the URL above.');
  }
}

/** Request a secret value from the user interactively via stdin. */
export async function requestSecret(name: string, description?: string): Promise<string | null> {
  if (description) {
    console.error(`[cli] ${description}`);
  }
  console.error(`[cli] Enter value for ${name}:`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const value = await new Promise<string>((resolve) => {
      rl.question('', (answer) => resolve(answer));
    });
    return value.trim() || null;
  } finally {
    rl.close();
  }
}

/** Resolve a stable installation-secrets path for a given app installation. */
export function resolveInstallationSecretsPath(configPath: string): string {
  return resolve(dirname(resolve(configPath)), INSTALLATION_SECRETS_DIR, INSTALLATION_SECRETS_FILE);
}

/** Compute a deterministic installation id from the app source path. */
export function deriveInstallationId(sourcePath: string): string {
  return `cli_${createHash('sha256').update(resolve(sourcePath)).digest('hex').slice(0, 16)}`;
}

// ---------------------------------------------------------------------------
// Station OAuth helpers
// ---------------------------------------------------------------------------

/**
 * Derive the station base URL from a redirect URI.
 *
 * E.g. `https://your-station.example.com/auth/callback` → `https://your-station.example.com`
 */
export function deriveStationBaseUrl(redirectUri: string): string {
  const parsed = new URL(redirectUri);
  return `${parsed.protocol}//${parsed.host}`;
}

/**
 * Initiate an OAuth flow via a remote station server.
 *
 * Instead of generating state locally and running a localhost request server,
 * this calls the station's `GET /auth/start` endpoint, which registers the
 * state server-side and returns the proper OAuth URL. The user opens the URL,
 * completes consent, and the station handles the request + token exchange +
 * persistence.
 *
 * The CLI then polls `GET /auth/status?installationId=X` on the station until
 * the tokens are persisted, or a timeout is reached.
 */
export async function requestRemoteAuth(
  stationBaseUrl: string,
  installationId: string,
  options: {
    openInBrowser?: boolean;
    title?: string;
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {},
): Promise<{ url: string; state: string }> {
  const timeoutMs = options.timeoutMs ?? 300_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;

  // 1. Call station's /auth/start to get the OAuth URL with server-registered state.
  const startUrl = new URL('/auth/start', stationBaseUrl);
  startUrl.searchParams.set('installationId', installationId);

  const startResponse = await fetch(startUrl.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!startResponse.ok) {
    const body = await startResponse.text().catch(() => 'unknown error');
    throw new Error(`Station /auth/start failed (${startResponse.status}): ${body}`);
  }

  const { url, state } = (await startResponse.json()) as { url: string; state: string };
  if (!url) {
    throw new Error('Station returned an empty OAuth URL');
  }

  // 2. Show / open the URL.
  if (options.openInBrowser) {
    await openUrl(url, options.title);
  } else {
    if (options.title) console.error(`[cli] ${options.title}`);
    console.error('[cli] Open this URL in your browser and authorize the app:');
    console.error('');
    console.error(`  ${highlightUrl(url)}`);
    console.error('');
  }

  // 3. Poll station for completion.
  console.error('[cli] Waiting for authentication... (Ctrl+C to cancel)');
  const statusUrl = new URL('/auth/status', stationBaseUrl);
  statusUrl.searchParams.set('installationId', installationId);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));

    try {
      const resp = await fetch(statusUrl.toString());
      if (resp.ok) {
        const body = (await resp.json()) as { authenticated: boolean };
        if (body.authenticated) {
          const useColor = !!process.stderr.isTTY && !process.env.NO_COLOR;
          console.error(`[cli] ${useColor ? `${GREEN}✓${RESET}` : '✓'} Authentication complete.`);
          return { url, state };
        }
      }
    } catch {
      // Network hiccup — retry silently.
    }
  }

  throw new Error(
    'OAuth callback timed out waiting for the remote station. ' +
      'The user may have denied consent or the flow was not completed in time.',
  );
}
