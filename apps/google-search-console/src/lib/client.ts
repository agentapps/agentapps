/**
 * HTTP client for the Google Search Console API (searchconsole.googleapis.com).
 *
 * - One 30 s deadline per call, retries included, so a call always ends inside the
 *   host's 60 s tool budget with this client's own message
 * - Idempotent requests (GET, PUT, DELETE) retry on 429/502/503/504 and network errors,
 *   at most 3 attempts, honouring a short Retry-After; POST and PATCH never retry
 * - OAuth: the access token is read from the installation secrets on every call. Token refresh
 *   belongs to the host (`ctx.auth.refresh()`), so the OAuth client secret never enters
 *   this process. A 401 triggers exactly one refresh and replay, POST included: Google
 *   rejected the request at the auth layer, before processing it
 * - Network failures name the host; quoted error bodies are capped; no token ever
 *   appears in an error message
 */

export const BASE_URL = 'https://searchconsole.googleapis.com';
const HOST = new URL(BASE_URL).host;

/** The scope every write tool needs; also covers every read. */
export const REQUIRED_SCOPE = 'https://www.googleapis.com/auth/webmasters';

export const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 5_000;
const MAX_ERROR_BODY_CHARS = 2_000;
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

const CONNECT_HINT =
  'Connect the Google account with `agentapps <alias> auth` (or `agentapps <alias> auth reauth`).';

/**
 * The part of the SDK tool and health contexts the client uses. `auth` and
 * `secrets.getSystem` are optional so a context without them still type-checks;
 * without `auth` a 401 cannot be refreshed and is reported as such.
 */
export interface ClientContext {
  secrets: {
    getInstallation(): Promise<Record<string, string> | null>;
    getSystem?(): Promise<Record<string, string> | null>;
  };
  auth?: { refresh(): Promise<{ accessToken: string }> };
  signal?: AbortSignal;
}

export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  params?: Record<string, QueryValue>;
  body?: unknown;
  /** Overall deadline for the call, retries included (health checks use a shorter one). */
  timeoutMs?: number;
}

/** Thrown for non-2xx responses so callers can branch on the status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Reads the stored access token, or explains how to connect the account. */
export async function getAccessToken(ctx: ClientContext): Promise<string> {
  const secrets = (await ctx.secrets.getInstallation().catch(() => null)) ?? {};
  if (!secrets.ACCESS_TOKEN) {
    throw new Error(`[AUTH_REQUIRED] No Google account is connected. ${CONNECT_HINT}`);
  }
  return secrets.ACCESS_TOKEN;
}

/**
 * Explains a failed refresh. A missing OAuth client is a station configuration
 * problem (fix with `agentapps config`), anything else means the refresh token is
 * dead (expired, revoked, or the user removed access) and the user must reconnect.
 */
async function refreshFailure(ctx: ClientContext): Promise<Error> {
  const system = (await ctx.secrets.getSystem?.().catch(() => null)) ?? null;
  if (system && (!system.CLIENT_ID || !system.CLIENT_SECRET)) {
    return new Error(
      '[SYSTEM_CONFIG_MISSING] The Google OAuth client is not configured, so the access ' +
        'token cannot be refreshed. Set it with `agentapps config app.google.search-console ' +
        'CLIENT_ID:<id> CLIENT_SECRET:<secret>`.',
    );
  }
  return new Error(
    '[AUTH_EXPIRED] Google rejected the access token and refreshing it failed: the refresh ' +
      `token is expired or revoked. ${CONNECT_HINT}`,
  );
}

function buildUrl(path: string, params?: RequestOptions['params']): URL {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

/** Retry-After in ms (seconds or an HTTP date), or undefined when absent or unparsable. */
function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

interface GoogleErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: Array<{ reason?: string; message?: string }>;
    details?: Array<{ reason?: string }>;
  };
}

const cap = (text: string) =>
  text.length > MAX_ERROR_BODY_CHARS ? `${text.slice(0, MAX_ERROR_BODY_CHARS)}...` : text;

/**
 * Turns a Google error response into a message with a bracketed code the agent can
 * match and a next step. Google sends `{ error: { code, message, status, errors[],
 * details[] } }`; the reasons in `errors[]` (v3 style) and `details[]` (ErrorInfo)
 * tell the 403 cases apart.
 */
export function describeError(status: number, statusText: string, text: string): string {
  let parsed: GoogleErrorBody | undefined;
  try {
    parsed = JSON.parse(text) as GoogleErrorBody;
  } catch {
    // Not JSON (an HTML error page from a proxy): quote the capped text below.
  }
  const err = parsed?.error;
  const message = cap(err?.message ?? (text || statusText));
  const reasons = [
    ...(err?.errors ?? []).map((e) => e.reason),
    ...(err?.details ?? []).map((d) => d.reason),
    err?.status,
  ].filter((r): r is string => typeof r === 'string');
  const has = (...names: string[]) => names.some((n) => reasons.includes(n));

  if (status === 400) return `[BAD_REQUEST] ${message}`;
  if (status === 401) return `[AUTH_EXPIRED] ${message} ${CONNECT_HINT}`;
  if (status === 403) {
    if (has('ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'insufficientPermissions')) {
      return (
        `[INSUFFICIENT_SCOPE] ${message} The connected account did not permission ${REQUIRED_SCOPE}. ` +
        'Reconnect with `agentapps <alias> auth reauth` and accept every requested permission.'
      );
    }
    if (has('SERVICE_DISABLED', 'accessNotConfigured')) {
      return (
        `[API_DISABLED] ${message} Enable the "Google Search Console API" in the Google Cloud ` +
        'project that owns the OAuth client, wait a few minutes, then retry.'
      );
    }
    if (has('RATE_LIMIT_EXCEEDED', 'rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded')) {
      return `[RATE_LIMITED] ${message} Wait and retry; Search Console quotas are per site and per user.`;
    }
    return (
      `[FORBIDDEN] ${message} The account has no access to that property, or siteUrl does not ` +
      'match it exactly. Call list-sites and pass siteUrl exactly as listed ' +
      '(sc-domain:example.com, or https://www.example.com/ with the trailing slash).'
    );
  }
  if (status === 404) return `[NOT_FOUND] ${message}`;
  if (status === 429) {
    return `[RATE_LIMITED] ${message} Wait and retry; Search Console quotas are per site and per user.`;
  }
  return `[GOOGLE_SEARCH_CONSOLE_ERROR] ${status} ${statusText}: ${message}`;
}

/** Calls the API and returns the parsed JSON body (undefined for an empty body). */
export async function apiRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  ctx: ClientContext,
  options: RequestOptions = {},
): Promise<T> {
  let token = await getAccessToken(ctx);
  const url = buildUrl(path, options.params);

  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = ctx.signal ? AbortSignal.any([deadline, ctx.signal]) : deadline;
  const retries = method === 'GET' || method === 'PUT' || method === 'DELETE';
  let refreshed = false;

  for (let attempt = 1; ; attempt++) {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal,
      });
    } catch (err) {
      if (deadline.aborted) {
        throw new Error(
          `[GOOGLE_SEARCH_CONSOLE_TIMEOUT] ${HOST} did not answer within ${timeoutMs / 1000} s.`,
        );
      }
      if (signal.aborted) throw new Error('[CANCELLED] The request was cancelled.');
      if (retries && attempt < MAX_ATTEMPTS) {
        await sleep(250 * 2 ** (attempt - 1), signal);
        continue;
      }
      const cause = (err as { cause?: { code?: string } })?.cause?.code ?? String(err);
      throw new Error(`[GOOGLE_SEARCH_CONSOLE_UNREACHABLE] Could not reach ${HOST}: ${cause}.`);
    }

    if (response.ok) {
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }

    // The proactive refresh happens host-side when EXPIRY_DATE has passed; a 401 can
    // still arrive (revoked token, clock skew, stale expiry). Refresh once and replay.
    if (response.status === 401 && !refreshed) {
      refreshed = true;
      await response.body?.cancel();
      if (!ctx.auth) throw await refreshFailure(ctx);
      try {
        token = (await ctx.auth.refresh()).accessToken;
      } catch {
        throw await refreshFailure(ctx);
      }
      attempt--;
      continue;
    }

    const wait = retryAfterMs(response) ?? 250 * 2 ** (attempt - 1);
    if (retries && RETRY_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS) {
      if (wait <= MAX_RETRY_AFTER_MS) {
        await response.body?.cancel();
        await sleep(wait, signal);
        continue;
      }
    }

    const text = await response.text().catch(() => '');
    throw new ApiError(response.status, describeError(response.status, response.statusText, text));
  }
}
