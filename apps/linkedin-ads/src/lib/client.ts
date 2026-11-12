/**
 * HTTP client for the LinkedIn Marketing API (Advertising), versioned REST under /rest.
 *
 * - Every request carries `LinkedIn-Version` (pinned below) and the Rest.li 2.0 header
 * - Query strings are built by hand: Rest.li 2.0 needs its structural characters
 *   (`List(...)`, `(key:value)`) unencoded while the values inside are percent-encoded,
 *   which URLSearchParams cannot express. Tools build values with the helpers below
 * - One 30 s deadline per call, retries included, so a call always ends inside the
 *   host's 60 s tool budget with this client's own message
 * - Idempotent requests (GET, PUT, DELETE) retry on 429/502/503/504 and network errors,
 *   at most 3 attempts, honouring a short Retry-After; POST never retries after a
 *   response, except once after a token refresh (a 401 means it was never processed)
 * - OAuth secrets are read on every call, never cached in module state; a refreshed
 *   token is persisted with `ctx.secrets.updateInstallation`
 * - Network failures name the host; quoted error bodies are capped; no credential ever
 *   appears in an error message
 */

export const BASE_URL = 'https://api.linkedin.com/rest';
export const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
/**
 * Marketing API version (YYYYMM). LinkedIn supports each monthly version for at least one
 * year and rejects requests without one. 202610 was the latest on 2026-10-17; move it
 * forward (and re-run the tests) before it is sunset, around October 2027.
 */
export const LINKEDIN_VERSION = '202610';

export const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 5_000;
const MAX_ERROR_BODY_CHARS = 2_000;
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

const CONFIG_HINT = 'agentapps config app.linkedin-ads CLIENT_ID:<value> CLIENT_SECRET:<value>';
const RECONNECT_HINT =
  'Reconnect the account with `agentapps <alias> auth reauth`, or set a new token with ' +
  '`agentapps config <alias> ACCESS_TOKEN:<token>`.';

/**
 * The part of the SDK tool and health contexts the client uses. `getSystem` and
 * `updateInstallation` are optional so a test or a health check without them still works; the
 * token refresh is then skipped.
 */
export interface ClientContext {
  secrets: {
    getInstallation(): Promise<Record<string, string> | null>;
    getSystem?(): Promise<Record<string, string> | null>;
    updateInstallation?(secrets: Record<string, string>): Promise<void>;
  };
  signal?: AbortSignal;
}

export interface RequestOptions {
  /**
   * Query parameters as `[name, value]` pairs. Values go into the URL as they are: build
   * them with `plain()`, `urn()`, `restliList()` or `restliDate()` so they are encoded the
   * way Rest.li 2.0 expects.
   */
  query?: Array<[string, string | undefined]>;
  body?: unknown;
  /** Extra headers, such as `X-RestLi-Method: PARTIAL_UPDATE`. */
  headers?: Record<string, string>;
  /** Overall deadline for the call, retries included (health checks use a shorter one). */
  timeoutMs?: number;
  /** Scope that a 403 most likely means is missing, named in the error message. */
  scope?: string;
  /** Whether to refresh the token on a 401 and retry once (default true). */
  refresh?: boolean;
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

// ---------------------------------------------------------------------------
// Rest.li 2.0 query helpers
// ---------------------------------------------------------------------------

/** A scalar query value (page token, page size, enum). */
export function plain(value: string | number | boolean): string {
  return encodeURIComponent(String(value));
}

/** A URN inside a Rest.li structure: `urn:li:sponsoredAccount:1` -> `urn%3Ali%3A...`. */
export function urn(type: string, id: string): string {
  return encodeURIComponent(`urn:li:${type}:${id}`);
}

/** `List(a,b,c)` from already encoded items. */
export function restliList(items: string[]): string {
  return `List(${items.join(',')})`;
}

/** `(year:2026,month:1,day:31)` from an ISO date `2026-01-31`. */
export function restliDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `(year:${year},month:${month},day:${day})`;
}

// ---------------------------------------------------------------------------
// Secrets and token refresh
// ---------------------------------------------------------------------------

/** Reads the OAuth installation secrets, or explains how to connect the account. */
export async function getInstallationSecrets(ctx: ClientContext): Promise<Record<string, string>> {
  const secrets = (await ctx.secrets.getInstallation().catch(() => null)) ?? {};
  if (!secrets.ACCESS_TOKEN) {
    throw new Error(
      '[AUTH_REQUIRED] LinkedIn account not connected: ACCESS_TOKEN is missing. Connect it ' +
        'with `agentapps <alias> auth`, or set a token with ' +
        '`agentapps config <alias> ACCESS_TOKEN:<token>`.',
    );
  }
  return secrets;
}

/**
 * Exchanges the refresh token for a new access token and persists it. LinkedIn only issues
 * refresh tokens to approved Marketing Developer Platform partners; without one the user
 * reconnects every 60 days.
 */
async function refreshAccessToken(
  ctx: ClientContext,
  user: Record<string, string>,
  signal: AbortSignal,
): Promise<string> {
  if (!user.REFRESH_TOKEN) {
    throw new Error(
      '[AUTH_EXPIRED] LinkedIn rejected the access token (expired or revoked; tokens last 60 ' +
        'days) and there is no refresh token: LinkedIn issues refresh tokens only to approved ' +
        `Marketing Developer Platform apps. ${RECONNECT_HINT}`,
    );
  }
  const system = (await ctx.secrets.getSystem?.().catch(() => null)) ?? {};
  if (!system.CLIENT_ID || !system.CLIENT_SECRET) {
    throw new Error(
      '[SYSTEM_CONFIG_MISSING] The LinkedIn access token expired and cannot be refreshed: ' +
        `the app's CLIENT_ID or CLIENT_SECRET is not configured. Set them with \`${CONFIG_HINT}\`.`,
    );
  }

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: user.REFRESH_TOKEN,
        client_id: system.CLIENT_ID,
        client_secret: system.CLIENT_SECRET,
      }),
      signal,
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string } })?.cause?.code ?? 'network error';
    throw new Error(
      `[LINKEDIN_ADS_UNREACHABLE] Could not reach www.linkedin.com to refresh the token: ${cause}.`,
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `[AUTH_EXPIRED] LinkedIn refused to refresh the token (${response.status}): the refresh ` +
        `token expired (they last one year) or was revoked. ${RECONNECT_HINT}`,
    );
  }
  const tokens = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof tokens.access_token !== 'string' || !tokens.access_token) {
    throw new Error(
      `[AUTH_EXPIRED] LinkedIn returned no access token on refresh. ${RECONNECT_HINT}`,
    );
  }
  const update: Record<string, string> = { ACCESS_TOKEN: tokens.access_token };
  if (typeof tokens.refresh_token === 'string' && tokens.refresh_token) {
    update.REFRESH_TOKEN = tokens.refresh_token;
  }
  if (typeof tokens.expires_in === 'number') {
    update.EXPIRY_DATE = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  }
  // A failed write only costs another refresh next time; the call itself can go on.
  await ctx.secrets.updateInstallation?.(update).catch(() => undefined);
  return tokens.access_token;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

function buildUrl(path: string, query?: RequestOptions['query']): URL {
  const parts = (query ?? [])
    .filter((pair): pair is [string, string] => pair[1] !== undefined)
    .map(([key, value]) => `${key}=${value}`);
  return new URL(`${BASE_URL}${path}${parts.length > 0 ? `?${parts.join('&')}` : ''}`);
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

/** Pulls LinkedIn's `message` out of a JSON error body, or quotes the capped text. */
function errorDetail(text: string): string {
  try {
    const body = JSON.parse(text) as { message?: unknown };
    if (typeof body.message === 'string' && body.message) {
      return body.message.slice(0, MAX_ERROR_BODY_CHARS);
    }
  } catch {
    // Not JSON: quote the text below.
  }
  return text.length > MAX_ERROR_BODY_CHARS ? `${text.slice(0, MAX_ERROR_BODY_CHARS)}...` : text;
}

function errorFor(status: number, statusText: string, detail: string, scope?: string): ApiError {
  const suffix = detail ? `: ${detail}` : '';
  switch (status) {
    case 400:
    case 422:
      return new ApiError(
        status,
        `[BAD_REQUEST] LinkedIn rejected the request (${status})${suffix}`,
      );
    case 403:
      return new ApiError(
        status,
        `[FORBIDDEN] LinkedIn denied access (403)${suffix}. The connected member needs the ` +
          `${scope ?? 'r_ads'} scope (granted to apps approved for the Advertising API) and a ` +
          'role on the ad account that allows this (VIEWER can only read). Reconnect with ' +
          '`agentapps <alias> auth reauth` after the scope is added.',
      );
    case 404:
      return new ApiError(
        status,
        `[NOT_FOUND] LinkedIn found no such resource (404)${suffix}. Check the ids with ` +
          'list-ad-accounts, list-campaigns or list-creatives.',
      );
    case 429:
      return new ApiError(
        status,
        `[RATE_LIMITED] LinkedIn throttled the request (429)${suffix}. Wait a few minutes; for ` +
          'get-ad-analytics, request fewer metrics or a shorter date range.',
      );
    default:
      return new ApiError(status, `[LINKEDIN_ADS_ERROR] ${status} ${statusText}${suffix}`);
  }
}

/** Calls the API and returns the parsed JSON body (undefined for 201/204 without a body). */
export async function apiRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  ctx: ClientContext,
  options: RequestOptions = {},
): Promise<T> {
  const user = await getInstallationSecrets(ctx);
  let accessToken = user.ACCESS_TOKEN;
  let refreshed = options.refresh === false;
  const url = buildUrl(path, options.query);

  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = ctx.signal ? AbortSignal.any([deadline, ctx.signal]) : deadline;
  const retries = method === 'GET' || method === 'PUT' || method === 'DELETE';

  for (let attempt = 1; ; attempt++) {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': LINKEDIN_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
      ...options.headers,
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
          `[LINKEDIN_ADS_TIMEOUT] ${url.host} did not answer within ${timeoutMs / 1000} s.`,
        );
      }
      if (signal.aborted) throw new Error('[CANCELLED] The request was cancelled.');
      if (retries && attempt < MAX_ATTEMPTS) {
        await sleep(250 * 2 ** (attempt - 1), signal);
        continue;
      }
      const cause = (err as { cause?: { code?: string } })?.cause?.code ?? String(err);
      throw new Error(`[LINKEDIN_ADS_UNREACHABLE] Could not reach ${url.host}: ${cause}.`);
    }

    if (response.ok) {
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }

    // A 401 was rejected before processing, so even a POST may be replayed once.
    if (response.status === 401) {
      await response.body?.cancel();
      if (refreshed) {
        throw new ApiError(
          401,
          `[AUTH_EXPIRED] LinkedIn rejected the access token (401). ${RECONNECT_HINT}`,
        );
      }
      refreshed = true;
      accessToken = await refreshAccessToken(ctx, user, signal);
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
    throw errorFor(response.status, response.statusText, errorDetail(text), options.scope);
  }
}
