/**
 * HTTP client for the YouTube Analytics API and the YouTube Data API v3.
 *
 * - Two fixed hosts (ANALYTICS_BASE_URL, DATA_BASE_URL); a tool picks one, never from arguments
 * - Auth is a Google OAuth 2.0 Bearer token read from the installation secrets on every call. The host
 *   owns the token exchange and the refresh (`ctx.auth.refresh()`), so the client secret never
 *   enters this process. A 401 triggers exactly one refresh and replay
 * - One 30 s deadline per call, retries and the refresh included, so a call always ends inside
 *   the host's 60 s tool budget with this client's own message
 * - GET retries on 429/502/503/504 and network errors, at most 3 attempts, honouring a short
 *   Retry-After (this app only reads, so every request is a GET)
 * - Google error bodies are reduced to their message and reason; no credential ever appears in
 *   an error message
 */

export const ANALYTICS_BASE_URL = 'https://youtubeanalytics.googleapis.com/v2';
export const DATA_BASE_URL = 'https://www.googleapis.com/youtube/v3';

export const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/yt-analytics.readonly';
export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

export const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 5_000;
const MAX_ERROR_MESSAGE_CHARS = 2_000;
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

const CONNECT_HINT =
  'Connect the Google account with `agentapps <alias> auth` (or `agentapps <alias> auth reauth`).';

/** The part of the SDK tool and health contexts the client uses. */
export interface ClientContext {
  secrets: {
    getInstallation(): Promise<Record<string, string> | null>;
    updateInstallation(secrets: Record<string, string>): Promise<void>;
  };
  auth: {
    refresh(): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string }>;
  };
  signal?: AbortSignal;
}

export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  params?: Record<string, QueryValue>;
  /** Overall deadline for the call, retries included (health checks use a shorter one). */
  timeoutMs?: number;
}

/** Thrown for non-2xx responses so callers can branch on the status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Reads the OAuth access token, or explains how to connect the account. */
export async function getAccessToken(ctx: ClientContext): Promise<string> {
  const secrets = (await ctx.secrets.getInstallation().catch(() => null)) ?? {};
  if (!secrets.ACCESS_TOKEN) {
    throw new Error(
      `[AUTH_REQUIRED] No Google account is connected (missing ACCESS_TOKEN). ${CONNECT_HINT}`,
    );
  }
  return secrets.ACCESS_TOKEN;
}

/**
 * Asks the host to refresh the access token and stores the result.
 *
 * The host persists the new token itself, but not always under `EXPIRY_DATE`; writing both
 * values back keeps the next `getInstallation()` from refreshing again.
 */
async function refreshAccessToken(ctx: ClientContext): Promise<string> {
  const user = (await ctx.secrets.getInstallation().catch(() => null)) ?? {};
  if (!user.REFRESH_TOKEN) {
    throw new Error(
      `[AUTH_EXPIRED] Google rejected the access token and there is no refresh token to renew it. ${CONNECT_HINT}`,
    );
  }
  let refreshed: { accessToken: string; expiresAt?: string };
  try {
    refreshed = await ctx.auth.refresh();
  } catch (err) {
    const detail = (err as Error).message ?? String(err);
    const config = /CLIENT_ID|CLIENT_SECRET|tokenUrl/.test(detail)
      ? ' The OAuth client is not configured: set it with `agentapps config app.youtube-analytics CLIENT_ID:<id> CLIENT_SECRET:<secret>`.'
      : ` The refresh token is no longer valid. ${CONNECT_HINT}`;
    throw new Error(`[AUTH_EXPIRED] Refreshing the Google access token failed.${config}`);
  }
  const expiresAt = refreshed.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString();
  await ctx.secrets
    .updateInstallation({ ACCESS_TOKEN: refreshed.accessToken, EXPIRY_DATE: expiresAt })
    .catch(() => undefined);
  return refreshed.accessToken;
}

function buildUrl(base: string, path: string, params?: RequestOptions['params']): URL {
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
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

/** Turns a Google error response into a message that says what to do next. */
export function describeGoogleError(
  status: number,
  text: string,
): { reason?: string; message: string } {
  let body: GoogleErrorBody | undefined;
  try {
    body = JSON.parse(text) as GoogleErrorBody;
  } catch {
    // Not JSON (an HTML error page from a proxy); quote the start of it below.
  }
  const reason =
    body?.error?.errors?.[0]?.reason ?? body?.error?.details?.[0]?.reason ?? body?.error?.status;
  // Some quota messages carry HTML links; keep only their text.
  let detail = (body?.error?.message ?? text).replace(/<[^>]*>/g, '').trim();
  if (detail.length > MAX_ERROR_MESSAGE_CHARS) {
    detail = `${detail.slice(0, MAX_ERROR_MESSAGE_CHARS)}...`;
  }
  const quoted = detail ? `: ${detail}` : '';

  if (status === 403 && /insufficient|SCOPE/i.test(`${reason} ${detail}`)) {
    return {
      reason,
      message:
        `[MISSING_SCOPE] 403${quoted}. The token lacks a scope this app needs ` +
        `(${ANALYTICS_SCOPE} and ${YOUTUBE_SCOPE}). Reconnect with \`agentapps <alias> auth reauth\` ` +
        'and permission every requested permission.',
    };
  }
  if (/quotaExceeded|dailyLimitExceeded|RESOURCE_EXHAUSTED/i.test(String(reason))) {
    return {
      reason,
      message: `[QUOTA_EXCEEDED] ${status}${quoted}. The Google Cloud project's daily YouTube quota is used up; it resets at midnight Pacific time.`,
    };
  }
  if (status === 429 || /rateLimitExceeded|userRateLimitExceeded/i.test(String(reason))) {
    return {
      reason,
      message: `[RATE_LIMITED] ${status}${quoted}. Wait a minute and retry.`,
    };
  }
  if (status === 403) {
    return {
      reason,
      message:
        `[FORBIDDEN] 403${quoted}. The connected account can only read channels it owns or ` +
        'manages; call list-channels to see them.',
    };
  }
  if (status === 404) {
    return { reason, message: `[NOT_FOUND] 404${quoted}.` };
  }
  if (status === 400) {
    return {
      reason,
      message: `[BAD_REQUEST] 400${quoted}. Check the metric, dimension and filter combination.`,
    };
  }
  return { reason, message: `[YOUTUBE_ERROR] ${status}${quoted}` };
}

/** Calls the API with GET and returns the parsed JSON body. */
export async function apiGet<T = unknown>(
  baseUrl: string,
  path: string,
  ctx: ClientContext,
  options: RequestOptions = {},
): Promise<T> {
  let token = await getAccessToken(ctx);
  const url = buildUrl(baseUrl, path, options.params);

  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = ctx.signal ? AbortSignal.any([deadline, ctx.signal]) : deadline;
  let refreshed = false;

  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal,
      });
    } catch (err) {
      if (deadline.aborted) {
        throw new Error(
          `[YOUTUBE_TIMEOUT] ${url.host} did not answer within ${timeoutMs / 1000} s. Narrow the date range or the number of results and retry.`,
        );
      }
      if (signal.aborted) throw new Error('[CANCELLED] The request was cancelled.');
      if (attempt < MAX_ATTEMPTS) {
        await sleep(250 * 2 ** (attempt - 1), signal);
        continue;
      }
      const cause = (err as { cause?: { code?: string } })?.cause?.code ?? String(err);
      throw new Error(`[YOUTUBE_UNREACHABLE] Could not reach ${url.host}: ${cause}.`);
    }

    if (response.ok) return (await response.json()) as T;

    // An expired or revoked access token: refresh once through the host and replay.
    if (response.status === 401 && !refreshed) {
      await response.body?.cancel();
      refreshed = true;
      token = await refreshAccessToken(ctx);
      attempt--;
      continue;
    }

    const wait = retryAfterMs(response) ?? 250 * 2 ** (attempt - 1);
    if (
      RETRY_STATUSES.has(response.status) &&
      attempt < MAX_ATTEMPTS &&
      wait <= MAX_RETRY_AFTER_MS
    ) {
      await response.body?.cancel();
      await sleep(wait, signal);
      continue;
    }

    const text = await response.text().catch(() => '');
    if (response.status === 401) {
      throw new ApiError(
        401,
        undefined,
        `[AUTH_EXPIRED] Google still rejects the access token after refreshing it. ${CONNECT_HINT}`,
      );
    }
    const { reason, message } = describeGoogleError(response.status, text);
    throw new ApiError(response.status, reason, message);
  }
}
