/**
 * Google People API client.
 *
 * Stateless: the OAuth access token is read from `ctx.secrets.getInstallation()` on
 * every call (per-app container -- each user's own token). Auth is a Bearer
 * header. Destination is the fixed Google People API host, so a plain `fetch`
 * is safe -- no SSRF surface.
 *
 * Token refresh is delegated to the host via `ctx.auth.refresh()`: the host
 * owns the token exchange and persistence, so the client secret never enters
 * the app process.
 *
 * Retries: only idempotent GETs are retried on transient errors (429/5xx)
 * with exponential backoff + jitter, honoring `Retry-After` clamped to 30s.
 * POST/PUT/PATCH/DELETE are NEVER retried.
 */

import { classifyGoogleError, GoogleApiError } from './_google-error.js';

const GOOGLE_PEOPLE_API_BASE = 'https://people.googleapis.com/v1';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_GET_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 30_000;

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
    updateInstallation: (secrets: Record<string, string>) => Promise<void>;
  };
  auth: {
    refresh: () => Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string }>;
  };
  requestAuth: (options: {
    provider: string;
    scopes?: string[];
    timeoutMs?: number;
  }) => Promise<{ accessToken: string; refreshToken?: string; expiresAt?: Date }>;
  log: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>,
  ) => void;
}

export interface GoogleRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Query params -- `undefined`/`null` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON request body (object). Serialized with JSON.stringify. */
  body?: unknown;
}

/**
 * Parse a stored `expiresAt` to epoch milliseconds.
 * Accepts both ISO 8601 timestamps and raw epoch ms strings.
 * Returns 0 (i.e. "expired") when the value is missing or unparseable.
 */
function expiryToMs(value: string | undefined): number {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Ensure we have a valid access token.
 *
 * If no user token exists, triggers ctx.requestAuth(): the host runs the OAuth
 * flow and returns the tokens, which the app persists via ctx.secrets.updateInstallation().
 *
 * If the persisted access token is expired, asks the host to refresh it via
 * ctx.auth.refresh().
 */
async function getAccessToken(ctx: SecretsContext): Promise<string> {
  const user = await ctx.secrets.getInstallation();

  // No persisted user tokens -> let the host run OAuth and return tokens.
  if (!user?.ACCESS_TOKEN) {
    ctx.log('info', 'No access token found, requesting host OAuth flow');
    const authResult = await ctx.requestAuth({
      provider: 'google',
      scopes: [
        'https://www.googleapis.com/auth/contacts',
        'https://www.googleapis.com/auth/contacts.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
    });

    const now = Date.now();
    const expiresAt = authResult.expiresAt ? authResult.expiresAt.getTime() : now + 3600 * 1000;

    await ctx.secrets.updateInstallation({
      ACCESS_TOKEN: authResult.accessToken,
      ...(authResult.refreshToken ? { REFRESH_TOKEN: authResult.refreshToken } : {}),
      EXPIRY_DATE: String(expiresAt),
    });

    return authResult.accessToken;
  }

  // Access token expired -> ask the host to refresh.
  const expiresAt = expiryToMs(user.EXPIRY_DATE);
  if (Date.now() >= expiresAt - 60_000) {
    if (!user.REFRESH_TOKEN) {
      throw new GoogleApiError(
        'AUTH_EXPIRED',
        401,
        'Access token expired and no refresh token available.',
        {
          type: 'user_action',
          description: 'Re-authenticate by connecting your Google account.',
        },
      );
    }

    ctx.log('info', 'Access token expired, refreshing via host');
    const refreshed = await ctx.auth.refresh();

    return refreshed.accessToken;
  }

  return user.ACCESS_TOKEN;
}

function buildUrl(endpoint: string, query?: GoogleRequestOptions['query']): string {
  const url = new URL(`${GOOGLE_PEOPLE_API_BASE}${endpoint}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
    }
  }
  const base = 800 * 2 ** attempt; // 0.8s, 1.6s, ...
  const jitter = Math.floor(Math.random() * 400);
  return Math.min(base + jitter, MAX_RETRY_AFTER_MS);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function parseSuccessBody<T>(response: Response): Promise<T> {
  if (response.status === 204) return {} as T;
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/**
 * Make a request to the Google People API.
 *
 * Handles:
 *  - OAuth access token retrieval (with refresh/re-auth)
 *  - Automatic retry on 401 (once, after refreshing the token)
 *  - Retry on transient 429/5xx for GET requests
 *  - Error classification via `classifyGoogleError`
 */
export async function googlePeopleRequest<T = unknown>(
  ctx: SecretsContext,
  endpoint: string,
  options: GoogleRequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const url = buildUrl(endpoint, options.query);

  const doFetch = async (): Promise<Response> => {
    const accessToken = await getAccessToken(ctx);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    return fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  const maxAttempts = method === 'GET' ? MAX_GET_RETRIES + 1 : 1;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await doFetch();

    // On 401, try refreshing the token once and retry.
    if (response.status === 401 && attempt === 0) {
      const user = await ctx.secrets.getInstallation();
      if (user?.REFRESH_TOKEN) {
        ctx.log('info', '401 received, attempting token refresh');
        try {
          await ctx.auth.refresh();
          // Retry with the refreshed token.
          const retryResponse = await doFetch();
          if (retryResponse.ok) return parseSuccessBody<T>(retryResponse);
          lastResponse = retryResponse;
          break;
        } catch {
          // Refresh failed — fall through to error classification.
          lastResponse = response;
          break;
        }
      }
    }

    if (response.ok) return parseSuccessBody<T>(response);

    lastResponse = response;
    const canRetry = attempt < maxAttempts - 1 && RETRYABLE_STATUS.has(response.status);
    if (!canRetry) break;
    await sleep(backoffMs(attempt, response.headers.get('retry-after')));
  }

  // Non-OK after (optional) retries -> classify + throw.
  const response = lastResponse as Response;
  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // keep raw text for the message
  }
  const classified = classifyGoogleError(response.status, parsed);
  throw new GoogleApiError(classified.code, response.status, classified.message, classified.action);
}
