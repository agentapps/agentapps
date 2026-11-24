/**
 * HTTP client for the Postiz API.
 *
 * - One 30 s deadline per call, retries included, so a call always ends inside the
 *   host's 60 s tool budget with this client's own message
 * - Idempotent requests (GET, PUT, DELETE, and a POST marked `idempotent`) retry on
 *   429/502/503/504 and network errors, at most 3 attempts, honouring a short
 *   Retry-After; other POSTs and PATCH never retry
 * - Installation secrets are read on every call, never cached in module state
 * - Network failures name the host; quoted error bodies are capped; no credential ever
 *   appears in an error message
 */

/** Postiz Cloud. `POSTIZ_API_URL` set to `cloud` means this base URL. */
export const BASE_URL = 'https://api.postiz.com/public/v1';

/** The `POSTIZ_API_URL` value that selects Postiz Cloud. */
export const CLOUD_SENTINEL = 'cloud';

/**
 * The API base URL of this installation: Postiz Cloud for the `cloud` sentinel, otherwise
 * the self-hosted public API base URL the user configured. Never taken from tool arguments.
 *
 * @spec POSTIZ-REQ-1
 */
export function resolveBaseUrl(secrets: Record<string, string>): string {
  const value = (secrets.POSTIZ_API_URL ?? '').trim();
  if (value === CLOUD_SENTINEL) return BASE_URL;
  if (!/^https?:\/\/[^\s/]+/.test(value)) {
    throw new Error(
      `[BAD_REQUEST] POSTIZ_API_URL must be "${CLOUD_SENTINEL}" or the public API base URL of a self-hosted Postiz, such as https://postiz.example.com/api/public/v1. Set it with \`agentapps config <alias> POSTIZ_API_URL:<value>\`.`,
    );
  }
  return value.replace(/\/+$/, '');
}

/** Installation secrets this app declares in agentapp.json. Every one is required. */
export const REQUIRED_SECRETS: readonly string[] = ['POSTIZ_API_KEY', 'POSTIZ_API_URL'];

export const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 5_000;
const MAX_ERROR_BODY_CHARS = 2_000;
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

/**
 * The part of the SDK tool and health contexts the client uses. `secrets` is listed
 * even when the app has no auth so that both contexts fit this type.
 */
export interface ClientContext {
  secrets: {
    getInstallation(): Promise<Record<string, string> | null>;
    getSystem(): Promise<Record<string, string> | null>;
  };
  signal?: AbortSignal;
}

export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  params?: Record<string, QueryValue | QueryValue[]>;
  body?: unknown;
  /** Overall deadline for the call, retries included (health checks use a shorter one). */
  timeoutMs?: number;
  /**
   * Retry like a GET. Only for a POST that reads (a search or report query sent as POST):
   * a POST that creates something must never be sent twice.
   */
  idempotent?: boolean;
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

/** Reads the declared installation secrets, or explains exactly which ones are missing. */
export async function getSecrets(ctx: ClientContext): Promise<Record<string, string>> {
  const secrets = (await ctx.secrets.getInstallation().catch(() => null)) ?? {};
  const missing = REQUIRED_SECRETS.filter((key) => !secrets[key]);
  if (missing.length > 0) {
    throw new Error(
      `[AUTH_REQUIRED] Missing installation secret(s): ${missing.join(', ')}. ` +
        `Set them with \`agentapps config <alias> ${missing[0]}:<value>\`.`,
    );
  }
  return secrets;
}

function buildUrl(base: string, path: string, params?: RequestOptions['params']): URL {
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    // No Postiz endpoint this app calls takes an array; comma-joined is the client default.
    if (Array.isArray(value)) {
      const parts = value.filter((v) => v !== undefined);
      if (parts.length > 0) url.searchParams.set(key, parts.join(','));
    } else {
      url.searchParams.set(key, String(value));
    }
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

/** Turns an error response into a message with a bracketed code and a next step. */
function describeError(response: Response, text: string): string {
  const detail =
    text.length > MAX_ERROR_BODY_CHARS ? `${text.slice(0, MAX_ERROR_BODY_CHARS)}...` : text;
  const quoted = `${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`;
  if (response.status === 401 || response.status === 403) {
    return `[AUTH_REQUIRED] Postiz rejected the API key (${quoted}). Create a key in Postiz under Settings > Developers > Public API and set it with \`agentapps config <alias> POSTIZ_API_KEY:<value>\`.`;
  }
  if (response.status === 429) {
    return `[RATE_LIMITED] Postiz limits requests per hour and this key has used its quota (${quoted}). Wait before calling again.`;
  }
  return `[POSTIZ_ERROR] ${quoted}`;
}

/** Calls the API and returns the parsed JSON body (undefined for 204). */
export async function apiRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  ctx: ClientContext,
  options: RequestOptions = {},
): Promise<T> {
  const secrets = await getSecrets(ctx);
  const url = buildUrl(resolveBaseUrl(secrets), path, options.params);
  // Postiz takes the raw key as the header value, with no "Bearer" prefix. Never log it.
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: secrets.POSTIZ_API_KEY,
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = ctx.signal ? AbortSignal.any([deadline, ctx.signal]) : deadline;
  const retries =
    method === 'GET' || method === 'PUT' || method === 'DELETE' || options.idempotent === true;

  for (let attempt = 1; ; attempt++) {
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
          `[POSTIZ_TIMEOUT] ${url.host} did not answer within ${timeoutMs / 1000} s.`,
        );
      }
      if (signal.aborted) throw new Error('[CANCELLED] The request was cancelled.');
      if (retries && attempt < MAX_ATTEMPTS) {
        await sleep(250 * 2 ** (attempt - 1), signal);
        continue;
      }
      const cause = (err as { cause?: { code?: string } })?.cause?.code ?? String(err);
      throw new Error(`[POSTIZ_UNREACHABLE] Could not reach ${url.host}: ${cause}.`);
    }

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
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
    throw new ApiError(response.status, describeError(response, text));
  }
}
