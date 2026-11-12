/**
 * Microsoft Graph API client for Excel.
 *
 * Stateless: OAuth tokens are read from `ctx.secrets.getInstallation()` /
 * `ctx.secrets.getSystem()` on every call. Auth is a Bearer token. Uses plain
 * `fetch` with `AbortController` for timeouts.
 *
 * Differs from the Outlook client in four deliberate ways (suite spec §3.2):
 *   1. Refreshed tokens are persisted via `ctx.secrets.updateInstallation`.
 *   2. Throttled and transient responses are retried, respecting idempotency.
 *   3. Responses can be decoded as a binary buffer, or handed back raw.
 *   4. Raw request bodies are sent as-is instead of being JSON-serialized.
 *
 * It also implements the reactive half of suite spec §8.1: a 401 returned
 * mid-flight triggers exactly one token refresh and replay before the
 * "reconnect your account" message is surfaced.
 */

import type { ExcelSecrets, GraphError } from './types.js';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([429, 503, 504]);
/** Upper bound on an honored Retry-After, so a large server-advertised delay cannot hang a request past REQUEST_TIMEOUT_MS times the attempt budget. */
const MAX_RETRY_DELAY_MS = 10_000;
/**
 * The single Graph scope every Excel tool depends on, named in the `403`
 * message so the agent learns what is missing rather than only that something
 * is (suite spec §8.1 row 4). Per-app constant: it swaps alongside the
 * `agentapps config app.microsoft.excel` string when this client is copied.
 */
const REQUIRED_SCOPE = 'Files.ReadWrite.All';
/**
 * Cap on how much of a non-JSON error body is embedded in the message.
 * Azure Front Door returns full HTML interstitials for some 502/503s; the
 * whole page in an agent's context buys nothing over its first page.
 */
const MAX_ERROR_BODY_CHARS = 2048;
/**
 * Surfaced when a 401 survives a token refresh (suite spec §8.1 row 2).
 * Distinct from the generic Graph error so the agent can tell "reconnect the
 * account" apart from the three auth failures that mean something else.
 */
const RECONNECT_MESSAGE =
  'Microsoft rejected the access token and refreshing it did not help. ' +
  'The refresh token is no longer valid — please reconnect your Microsoft account.';

/**
 * Only these methods may be retried after a response was received.
 * Retrying a POST that already reached Graph can create a duplicate
 * (suite spec §8.2).
 */
function isIdempotent(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
}

/** Exponential backoff used when no (or no usable) Retry-After is present. */
function backoffMs(attempt: number): number {
  return 2 ** attempt * 500;
}

/** Milliseconds to wait before the next attempt. */
function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get('retry-after');
  if (header !== null && header.trim() !== '') {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
    }
  }
  return backoffMs(attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
    updateInstallation: (secrets: Record<string, string>) => Promise<void>;
  };
}

export interface GraphRequestOptions {
  /** Extra request headers, merged over the defaults. */
  headers?: Record<string, string>;
  /** How to decode a successful response body. Defaults to 'json'. */
  responseType?: 'json' | 'text' | 'buffer' | 'raw';
  /** Raw body bytes, sent as-is instead of JSON-serializing `body`. */
  rawBody?: Buffer;
  /**
   * Omit the Authorization header for this request. Needed for pre-authenticated
   * URLs Graph itself hands back (e.g. a copy-operation monitor URL), which may be
   * hosted off graph.microsoft.com and can reject a graph-audience bearer token.
   */
  skipAuth?: boolean;
}

function getDisplayName(email?: string): string | undefined {
  if (!email) return undefined;
  const localPart = email.split('@')[0];
  return localPart
    .split(/[._-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Creates an authenticated Graph API client from secrets.
 * Refreshes the access token when it is expired or within 60s of expiring,
 * and persists the new credentials so the next call does not refresh again.
 */
export async function createGraphClient(ctx: SecretsContext) {
  const systemSecrets = (await ctx.secrets.getSystem()) ?? {};
  const installationSecrets = (await ctx.secrets.getInstallation()) ?? {};
  const secrets: ExcelSecrets = { ...systemSecrets, ...installationSecrets };

  if (!secrets.CLIENT_ID || !secrets.CLIENT_SECRET) {
    throw new Error(
      'Microsoft OAuth credentials not configured. Missing CLIENT_ID or CLIENT_SECRET. ' +
        'Set them with: agentapps config app.microsoft.excel CLIENT_ID:<value>',
    );
  }

  // Bound as `string` after the guard: `refreshAccessToken` below is a closure,
  // and TypeScript does not carry the narrowing of a captured `const` into one.
  const clientId: string = secrets.CLIENT_ID;
  const clientSecret: string = secrets.CLIENT_SECRET;

  let accessToken = secrets.ACCESS_TOKEN;
  let refreshToken = secrets.REFRESH_TOKEN;
  const expiryDate = secrets.EXPIRY_DATE ? new Date(secrets.EXPIRY_DATE).getTime() : undefined;

  if (!accessToken || !refreshToken) {
    throw new Error('Excel account not connected. Please connect your Microsoft account.');
  }

  /**
   * Exchanges the refresh token for a fresh access token and persists it.
   *
   * Shared by the proactive refresh below (driven by EXPIRY_DATE) and the
   * reactive one a mid-flight 401 triggers, so the `access_token` validation
   * that keeps `undefined` out of stored secrets exists in exactly one place.
   */
  async function refreshAccessToken(): Promise<void> {
    if (!refreshToken) {
      throw new Error('Excel account not connected. Please connect your Microsoft account.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const tokenResponse = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!tokenResponse.ok) {
        // The refresh token is dead: expired after ~90 days idle, or revoked.
        throw new Error(
          'Microsoft refresh token is no longer valid. Please reconnect your account.',
        );
      }

      const tokens = (await tokenResponse.json()) as Record<string, unknown>;
      if (typeof tokens.access_token !== 'string' || !tokens.access_token) {
        throw new Error(
          'Microsoft token refresh returned no access token. Please reconnect your account.',
        );
      }
      accessToken = tokens.access_token;
      if (tokens.refresh_token) refreshToken = tokens.refresh_token as string;

      // Deviation 1: persist the new credentials so the next call skips refresh.
      const expiresInSec = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600;
      await ctx.secrets.updateInstallation({
        ACCESS_TOKEN: accessToken,
        REFRESH_TOKEN: refreshToken as string,
        EXPIRY_DATE: new Date(Date.now() + expiresInSec * 1000).toISOString(),
      });
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to refresh Microsoft token: ${message}`);
    }
  }

  const needsRefresh = !expiryDate || expiryDate < Date.now() + 60_000;
  if (needsRefresh) {
    await refreshAccessToken();
  }

  let email = secrets.EMAIL;
  if (!email) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const meResponse = await fetch(`${GRAPH_BASE_URL}/me?$select=mail,userPrincipalName`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (meResponse.ok) {
        const me = (await meResponse.json()) as Record<string, unknown>;
        email = (me.mail as string) || (me.userPrincipalName as string) || 'unknown';
      } else {
        email = 'unknown';
      }
    } catch {
      clearTimeout(timeoutId);
      email = 'unknown';
    }
  }

  async function graphRequest<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    options?: GraphRequestOptions,
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${GRAPH_BASE_URL}${path}`;
    // Reassigned (not mutated) if a 401 forces a token refresh below, so each
    // attempt's `init` is built from the headers that attempt actually used.
    let headers: Record<string, string> = {
      ...(options?.skipAuth ? {} : { Authorization: `Bearer ${accessToken}` }),
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    let lastError: unknown;
    /** At most one refresh-and-replay per call, so a 401 loop cannot form. */
    let unauthorizedRetryUsed = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      // Tracks whether fetch() actually resolved a response, so a TypeError
      // thrown later while reading the body (e.g. a truncated stream) is not
      // mistaken for a connection-level failure that never reached Graph.
      let responseReceived = false;

      const init: RequestInit = { method, headers, signal: controller.signal };
      if (options?.rawBody !== undefined) {
        init.body = options.rawBody as unknown as RequestInit['body'];
      } else if (body !== undefined && method !== 'GET') {
        init.body = JSON.stringify(body);
      }

      try {
        const response = await fetch(url, init);
        responseReceived = true;
        clearTimeout(timeoutId);

        if (RETRYABLE_STATUS.has(response.status) && isIdempotent(method)) {
          lastError = await buildGraphError(response);
          if (attempt < MAX_ATTEMPTS - 1) {
            await sleep(retryDelayMs(response, attempt));
            continue;
          }
          throw lastError;
        }

        // Suite spec §8.1 row 1: the proactive refresh above covers the routine
        // case, but a 401 can still arrive mid-flight — a revoked token, a
        // conditional-access policy, clock skew, or a stale EXPIRY_DATE.
        // Refresh once and replay.
        //
        // This is deliberately outside the §8.2 idempotency rule: a 401 means
        // Graph rejected the request at the auth layer, before processing it,
        // so replaying a POST cannot double-create. The rule still governs the
        // 429/503/504 path above, which is untouched.
        if (response.status === 401 && !options?.skipAuth) {
          if (unauthorizedRetryUsed) throw new Error(RECONNECT_MESSAGE);
          unauthorizedRetryUsed = true;
          lastError = new Error(RECONNECT_MESSAGE);

          try {
            await refreshAccessToken();
          } catch {
            throw new Error(RECONNECT_MESSAGE);
          }

          headers = { ...headers, Authorization: `Bearer ${accessToken}` };

          if (attempt < MAX_ATTEMPTS - 1) continue;
          throw lastError;
        }

        // Deliberately returns before the `!response.ok` check below: 'raw' hands the
        // caller the Response object itself, errors included, so the caller owns status
        // handling. Do not adopt 'raw' expecting this client to have thrown on a 4xx.
        if (options?.responseType === 'raw') return response as T;

        if (response.status === 204) return null as T;
        if (!response.ok) throw await buildGraphError(response);

        if (options?.responseType === 'buffer') {
          return Buffer.from(await response.arrayBuffer()) as T;
        }
        if (options?.responseType === 'text') {
          return (await response.text()) as T;
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return (await response.json()) as T;
        }
        return (await response.text()) as T;
      } catch (error) {
        clearTimeout(timeoutId);

        // A connection-level failure means no response was received, so even a
        // POST is safe to retry. An abort (timeout) may have reached Graph, so
        // only idempotent methods retry on it. Once a response has been
        // received, a later TypeError (e.g. a truncated body stream) is not a
        // connection failure — retrying then could double-create a POST.
        const isAbort = error instanceof Error && error.name === 'AbortError';
        const isConnectionFailure = !responseReceived && error instanceof TypeError;
        const retriable = isConnectionFailure || (isAbort && isIdempotent(method));

        if (retriable && attempt < MAX_ATTEMPTS - 1) {
          lastError = error;
          await sleep(backoffMs(attempt));
          continue;
        }
        throw error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Graph request failed');
  }

  return { graphRequest, email, displayName: getDisplayName(email) };
}

/**
 * Converts a failed Graph response into an Error.
 * Surfaces innerError.request-id — the first thing Microsoft support asks for.
 * Never includes the Authorization header or any token value.
 */
export async function buildGraphError(response: Response): Promise<Error> {
  const errorBody = await response.text();
  let code: string | undefined;
  let message = `Graph API error (${response.status}): ${truncateErrorBody(errorBody)}`;
  try {
    const parsed = JSON.parse(errorBody) as GraphError;
    code = parsed.error?.code;
    if (parsed.error?.message) {
      const requestId = parsed.error.innerError?.['request-id'];
      message =
        `Graph API error: ${parsed.error.message} (${parsed.error.code})` +
        (requestId ? ` [request-id: ${requestId}]` : '');
    }
  } catch {
    // Body was not JSON; keep the raw (truncated) message.
  }

  // Suite spec §8.1 row 4: name the scope, don't just say one is missing.
  // Narrowed to `accessDenied` deliberately — an item-locked or
  // conditional-access 403 is not a missing-scope failure, and telling the
  // agent to reconnect for a scope it already holds sends it down a dead end.
  if (response.status === 403 && code === 'accessDenied') {
    message += ` — the account is authenticated but lacks the required ${REQUIRED_SCOPE} scope. Reconnect to permission it.`;
  }

  return new Error(message);
}

/** Keeps an HTML interstitial or other oversized non-JSON body from flooding the message. */
function truncateErrorBody(body: string): string {
  if (body.length <= MAX_ERROR_BODY_CHARS) return body;
  return `${body.slice(0, MAX_ERROR_BODY_CHARS)}… [truncated, ${body.length} characters total]`;
}
