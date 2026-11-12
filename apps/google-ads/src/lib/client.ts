/**
 * HTTP client for the Google Ads API (REST, plain fetch).
 *
 * - Every request carries `Authorization: Bearer <ACCESS_TOKEN>` and the `developer-token`
 *   header (a system secret). `login-customer-id` is sent only when the caller passes a
 *   manager account ID, and never on `customers:listAccessibleCustomers`.
 * - Token refresh is delegated to the host (`ctx.auth.refresh()`): proactively when
 *   EXPIRY_DATE has passed, and once after a 401. The client secret never enters the app.
 * - One 30 s deadline per call, retries and the refresh included, so a call always ends
 *   inside the host's 60 s tool budget with this client's own message.
 * - Reads (GET, and the read-only `googleAds:search` POST, flagged `idempotent`) retry on
 *   429/502/503/504 and network errors, at most 3 attempts, honouring a short Retry-After.
 *   Mutates never retry once a response was received.
 * - Google Ads failures are parsed into `<errorType>.<ERROR_CODE>: message` plus the
 *   request id, with a hint for the common ones. No credential ever appears in a message.
 */

export const API_VERSION = 'v26';
export const BASE_URL = `https://googleads.googleapis.com/${API_VERSION}`;
export const APP_ID = 'app.google.ads';

export const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 5_000;
const MAX_ERROR_CHARS = 2_000;
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

/** The part of the SDK tool and health contexts the client uses. */
export interface ClientContext {
  secrets: {
    getInstallation(): Promise<Record<string, string> | null>;
    getSystem(): Promise<Record<string, string> | null>;
    updateInstallation(secrets: Record<string, string>): Promise<void>;
  };
  auth: {
    refresh(): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string }>;
  };
  signal?: AbortSignal;
}

export interface RequestOptions {
  body?: unknown;
  /** Manager (MCC) account ID sent as `login-customer-id`, digits only. */
  loginCustomerId?: string;
  /** Overall deadline for the call, retries included (health checks use a shorter one). */
  timeoutMs?: number;
  /** True for requests that never change anything (GET, googleAds:search): they may retry. */
  idempotent?: boolean;
}

/** Thrown for non-2xx responses so callers can branch on the status and error codes. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Google Ads error codes as `<errorType>.<CODE>`, e.g. `authorizationError.USER_PERMISSION_DENIED`. */
    readonly codes: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface Credentials {
  developerToken: string;
  accessToken: string | undefined;
  refreshToken: string | undefined;
  expiresAtMs: number | undefined;
}

const CONNECT_HINT =
  'Connect the Google account that has access to the Google Ads accounts with `agentapps <alias> auth`.';

/** Reads the developer token and the OAuth tokens, or explains exactly what is missing. */
export async function getCredentials(ctx: ClientContext): Promise<Credentials> {
  const system = (await ctx.secrets.getSystem().catch(() => null)) ?? {};
  const user = (await ctx.secrets.getInstallation().catch(() => null)) ?? {};
  if (!system.DEVELOPER_TOKEN) {
    throw new Error(
      '[CONFIG_MISSING] The Google Ads developer token is not configured. ' +
        `Set it with \`agentapps config ${APP_ID} DEVELOPER_TOKEN:<value>\` ` +
        '(Google Ads manager account > Admin > API Center).',
    );
  }
  if (!user.ACCESS_TOKEN && !user.REFRESH_TOKEN) {
    throw new Error(`[AUTH_REQUIRED] No Google account is connected. ${CONNECT_HINT}`);
  }
  return {
    developerToken: system.DEVELOPER_TOKEN,
    accessToken: user.ACCESS_TOKEN || undefined,
    refreshToken: user.REFRESH_TOKEN || undefined,
    expiresAtMs: parseExpiry(user.EXPIRY_DATE),
  };
}

/** EXPIRY_DATE is an ISO timestamp (the host writes one); epoch ms is accepted too. */
function parseExpiry(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

async function refreshAccessToken(ctx: ClientContext, creds: Credentials): Promise<string> {
  if (!creds.refreshToken) {
    throw new Error(
      `[AUTH_EXPIRED] The Google access token expired and there is no refresh token. ${CONNECT_HINT}`,
    );
  }
  let refreshed: Awaited<ReturnType<ClientContext['auth']['refresh']>>;
  try {
    refreshed = await ctx.auth.refresh();
    if (!refreshed?.accessToken) throw new Error('no access token returned');
  } catch {
    throw new Error(
      `[AUTH_EXPIRED] Google rejected the stored refresh token (revoked or expired). ${CONNECT_HINT}`,
    );
  }
  // The host stores the new access token, but (in the local CLI host) records the expiry
  // under another key, so EXPIRY_DATE would stay in the past and every call would refresh
  // again. Best effort: a failure here must not fail the call that already has a token.
  if (refreshed.expiresAt) {
    await ctx.secrets.updateInstallation({ EXPIRY_DATE: refreshed.expiresAt }).catch(() => {});
  }
  return refreshed.accessToken;
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

/** Retry-After in ms (seconds or an HTTP date), or undefined when absent or unparsable. */
function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** Calls the API and returns the parsed JSON body (undefined for an empty body). */
export async function adsRequest<T = unknown>(
  method: 'GET' | 'POST',
  path: string,
  ctx: ClientContext,
  options: RequestOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = ctx.signal ? AbortSignal.any([deadline, ctx.signal]) : deadline;
  const timeoutError = () =>
    new Error(
      `[GOOGLE_ADS_TIMEOUT] ${new URL(BASE_URL).host} did not answer within ${timeoutMs / 1000} s.`,
    );

  const creds = await getCredentials(ctx);
  let accessToken = creds.accessToken;
  // Proactive refresh: the token is missing or within a minute of expiring.
  if (
    !accessToken ||
    (creds.expiresAtMs !== undefined && creds.expiresAtMs < Date.now() + 60_000)
  ) {
    accessToken = await refreshAccessToken(ctx, creds);
  }

  const url = new URL(`${BASE_URL}${path}`);
  const retries = method === 'GET' || options.idempotent === true;
  let refreshedAfter401 = false;

  for (let attempt = 1; ; attempt++) {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'developer-token': creds.developerToken,
    };
    if (options.loginCustomerId) headers['login-customer-id'] = options.loginCustomerId;
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
      if (deadline.aborted) throw timeoutError();
      if (signal.aborted) throw new Error('[CANCELLED] The request was cancelled.');
      // No response arrived, but a mutate may still have reached Google: only reads retry.
      if (retries && attempt < MAX_ATTEMPTS) {
        await sleep(250 * 2 ** (attempt - 1), signal).catch(() => {});
        if (deadline.aborted) throw timeoutError();
        continue;
      }
      const cause = (err as { cause?: { code?: string } })?.cause?.code ?? String(err);
      throw new Error(`[GOOGLE_ADS_UNREACHABLE] Could not reach ${url.host}: ${cause}.`);
    }

    // A 401 is rejected before any processing, so replaying even a mutate is safe.
    if (response.status === 401 && !refreshedAfter401) {
      refreshedAfter401 = true;
      await response.body?.cancel();
      accessToken = await refreshAccessToken(ctx, creds);
      continue;
    }

    if (response.ok) {
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }

    if (retries && RETRY_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS) {
      const wait = retryAfterMs(response) ?? 250 * 2 ** (attempt - 1);
      if (wait <= MAX_RETRY_AFTER_MS) {
        await response.body?.cancel();
        await sleep(wait, signal).catch(() => {});
        if (deadline.aborted) throw timeoutError();
        continue;
      }
    }

    throw await toApiError(response);
  }
}

interface GoogleAdsErrorItem {
  errorCode?: Record<string, string>;
  message?: string;
}

interface GoogleRpcError {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{ '@type'?: string; errors?: GoogleAdsErrorItem[]; requestId?: string }>;
  };
}

/** What the agent should do next for the error codes users hit most. */
const HINTS: Record<string, string> = {
  USER_PERMISSION_DENIED:
    'The connected Google user cannot reach this customer directly. If it is managed through a manager (MCC) account, pass that manager account ID as loginCustomerId (list-accessible-customers shows the managers, list-client-accounts their clients).',
  DEVELOPER_TOKEN_NOT_APPROVED:
    'The developer token only has test-account access. Apply for Basic or Standard access in the API Center of the manager account that owns the token, or use a test account.',
  DEVELOPER_TOKEN_PROHIBITED:
    'This developer token may not be used with this Google Cloud project. Use the developer token that belongs to the same OAuth client.',
  DEVELOPER_TOKEN_INVALID: `Check the developer token: \`agentapps config ${APP_ID} DEVELOPER_TOKEN:<value>\`.`,
  CUSTOMER_NOT_ENABLED:
    'The account is not active (cancelled, suspended or setup not finished). Pick another customer.',
  CUSTOMER_NOT_FOUND: 'Check the customer ID with list-accessible-customers.',
  REQUESTED_METRICS_FOR_MANAGER:
    'This is a manager account and has no metrics of its own. Run the report on a client account (list-client-accounts).',
  NON_MULTIPLE_OF_MINIMUM_CURRENCY_UNIT:
    "The amount must be a multiple of the account currency's smallest unit (for example whole units for JPY).",
  RESOURCE_EXHAUSTED: 'The API quota or rate limit was reached. Wait and retry later.',
  RESOURCE_TEMPORARILY_EXHAUSTED: 'Too many requests right now. Wait a minute and retry.',
  INVALID_LOGIN_CUSTOMER_ID_SERVING_CUSTOMER_ID_COMBINATION:
    'loginCustomerId must be a manager account above this customer. Check it with list-client-accounts.',
};

/** Converts a failed response into an ApiError with the Google Ads error codes. */
export async function toApiError(response: Response): Promise<ApiError> {
  const text = await response.text().catch(() => '');
  let parsed: GoogleRpcError | undefined;
  try {
    parsed = JSON.parse(text) as GoogleRpcError;
  } catch {
    parsed = undefined;
  }

  const prefix =
    response.status === 400
      ? 'BAD_REQUEST'
      : response.status === 401
        ? 'AUTH_EXPIRED'
        : response.status === 403
          ? 'PERMISSION_DENIED'
          : response.status === 404
            ? 'NOT_FOUND'
            : response.status === 429
              ? 'RATE_LIMITED'
              : 'GOOGLE_ADS_ERROR';

  const codes: string[] = [];
  const parts: string[] = [];
  let requestId: string | undefined;
  for (const detail of parsed?.error?.details ?? []) {
    if (!detail['@type']?.endsWith('GoogleAdsFailure')) continue;
    requestId ??= detail.requestId;
    for (const item of detail.errors ?? []) {
      const [type, value] = Object.entries(item.errorCode ?? {})[0] ?? [];
      const code = type && value ? `${type}.${value}` : undefined;
      if (code) codes.push(code);
      parts.push(code ? `${code}: ${item.message ?? ''}`.trim() : (item.message ?? ''));
    }
  }

  let message: string;
  if (parts.length > 0) {
    message = parts.join('; ');
  } else if (parsed?.error?.message) {
    message = parsed.error.message;
  } else {
    message = text || response.statusText || 'no response body';
  }
  if (response.status === 401) {
    message += ` ${CONNECT_HINT}`;
  }
  const hints = [...new Set(codes.map((c) => HINTS[c.split('.')[1] ?? '']).filter(Boolean))];
  if (hints.length > 0) message += ` Hint: ${hints.join(' ')}`;
  if (requestId) message += ` (request-id ${requestId})`;
  if (message.length > MAX_ERROR_CHARS) message = `${message.slice(0, MAX_ERROR_CHARS)}...`;

  return new ApiError(response.status, `[${prefix}] ${response.status}: ${message}`, codes);
}
