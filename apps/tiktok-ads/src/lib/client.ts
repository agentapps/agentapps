/**
 * HTTP client for the TikTok API for Business (Marketing API v1.3).
 *
 * - One 30 s deadline per call, retries included, so a call always ends inside the
 *   host's 60 s tool budget with this client's own message
 * - Idempotent requests (GET, PUT, DELETE) retry on 429/502/503/504 and network errors,
 *   at most 3 attempts, honouring a short Retry-After; POST and PATCH never retry
 * - Secrets are read on every call, never cached in module state
 * - Network failures name the host; quoted error bodies are capped; no credential ever
 *   appears in an error message (the URL, which can carry the app secret, is never quoted)
 *
 * TikTok specifics:
 * - The access token goes in an `Access-Token` header, not `Authorization`.
 * - Every answer is HTTP 200 with an envelope `{ code, message, request_id, data }`;
 *   `code !== 0` is an error. `apiRequest` unwraps `data` and maps the codes.
 * - Array and object query parameters (`fields`, `filtering`, `dimensions`) are sent as
 *   JSON strings, which is what the API expects.
 */

export const BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3';

/** Installation secrets this app declares in agentapp.json. Every one is required. */
export const REQUIRED_SECRETS: readonly string[] = ['TIKTOK_ACCESS_TOKEN'];

/** System secrets (the TikTok developer app), needed only to list advertisers. */
export const APP_SECRETS: readonly string[] = ['TIKTOK_APP_ID', 'TIKTOK_APP_SECRET'];

/** The app id used in `agentapps config <appId> ...` for system secrets. */
export const APP_ID = 'app.tiktok-ads';

export const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 5_000;
const MAX_ERROR_BODY_CHARS = 2_000;
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

/**
 * The part of the SDK tool and health contexts the client uses.
 */
export interface ClientContext {
  secrets: {
    getInstallation(): Promise<Record<string, string> | null>;
    getSystem?(): Promise<Record<string, string> | null>;
  };
  signal?: AbortSignal;
}

/** Arrays and objects are JSON-encoded into the query string. */
export type QueryValue =
  | string
  | number
  | boolean
  | undefined
  | unknown[]
  | Record<string, unknown>;

export interface RequestOptions {
  params?: Record<string, QueryValue>;
  body?: unknown;
  /** Overall deadline for the call, retries included (health checks use a shorter one). */
  timeoutMs?: number;
}

/** Thrown for non-2xx responses and for TikTok envelopes with `code !== 0`. */
export class ApiError extends Error {
  constructor(
    /** HTTP status, or 200 when TikTok reported the error in the envelope. */
    readonly status: number,
    message: string,
    /** TikTok's envelope code, when there was one. */
    readonly code?: number,
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
      `[AUTH_REQUIRED] Missing user secret(s): ${missing.join(', ')}. ` +
        `Set them with \`agentapps config <alias> ${missing[0]}:<value>\`.`,
    );
  }
  return secrets;
}

/** Reads the developer app's id and secret (system secrets), or explains how to set them. */
export async function getAppCredentials(
  ctx: ClientContext,
): Promise<{ appId: string; appSecret: string }> {
  const secrets = (await ctx.secrets.getSystem?.().catch(() => null)) ?? {};
  const missing = APP_SECRETS.filter((key) => !secrets[key]);
  if (missing.length > 0) {
    throw new Error(
      `[SYSTEM_CONFIG_MISSING] Missing system secret(s): ${missing.join(', ')}, the TikTok ` +
        `developer app's credentials (TikTok for Business developer portal, My Apps). Set them ` +
        `with \`agentapps config ${APP_ID} ${missing[0]}:<value>\`. Only list-advertisers needs ` +
        'them: the other tools work with an advertiser id you already know.',
    );
  }
  return { appId: secrets.TIKTOK_APP_ID, appSecret: secrets.TIKTOK_APP_SECRET };
}

function buildUrl(path: string, params?: RequestOptions['params']): URL {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(
      key,
      typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value),
    );
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

const cap = (text: string, max = MAX_ERROR_BODY_CHARS) =>
  text.length > max ? `${text.slice(0, max)}...` : text;

interface Envelope {
  code?: number;
  message?: string;
  request_id?: string;
  data?: unknown;
}

/**
 * Maps a TikTok envelope error to a message the agent can act on. Codes from the
 * Marketing API's return-code appendix: 40001 no permission, 40002 bad parameter,
 * 40100 too many requests, 40101-40109 access token missing, invalid, expired or revoked,
 * 5xxxx TikTok-side errors.
 */
function envelopeError(envelope: Envelope): ApiError {
  const code = Number(envelope.code);
  const detail = `${cap(String(envelope.message ?? 'no message'), 500)}${
    envelope.request_id ? ` (request_id ${envelope.request_id})` : ''
  }`;
  let message: string;
  if (code === 40100) {
    message = `[RATE_LIMITED] TikTok code 40100: ${detail}. Wait a minute and retry.`;
  } else if (code >= 40101 && code <= 40109) {
    message =
      `[AUTH_REQUIRED] TikTok code ${code}: ${detail}. The access token is missing, invalid ` +
      'or revoked: authorize the advertiser again and set the new token with ' +
      '`agentapps config <alias> TIKTOK_ACCESS_TOKEN:<value>`.';
  } else if (code === 40001) {
    message =
      `[FORBIDDEN] TikTok code 40001: ${detail}. The token has no permission for this ` +
      'advertiser or action: check the advertiser id (list-advertisers) and the scopes ' +
      'granted to the developer app.';
  } else if (code >= 40000 && code < 50000) {
    message = `[BAD_REQUEST] TikTok code ${code}: ${detail}. Fix the arguments and retry.`;
  } else {
    message = `[TIKTOK_ADS_ERROR] TikTok code ${code}: ${detail}. Retry later.`;
  }
  return new ApiError(200, message, code);
}

/** Calls the API and returns the envelope's `data`. */
export async function apiRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  ctx: ClientContext,
  options: RequestOptions = {},
): Promise<T> {
  const secrets = await getSecrets(ctx);
  const url = buildUrl(path, options.params);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    // Never log it.
    'Access-Token': secrets.TIKTOK_ACCESS_TOKEN,
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = ctx.signal ? AbortSignal.any([deadline, ctx.signal]) : deadline;
  const retries = method === 'GET' || method === 'PUT' || method === 'DELETE';

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
          `[TIKTOK_ADS_TIMEOUT] ${url.host} did not answer within ${timeoutMs / 1000} s.`,
        );
      }
      if (signal.aborted) throw new Error('[CANCELLED] The request was cancelled.');
      if (retries && attempt < MAX_ATTEMPTS) {
        await sleep(250 * 2 ** (attempt - 1), signal);
        continue;
      }
      const cause = (err as { cause?: { code?: string } })?.cause?.code ?? String(err);
      throw new Error(`[TIKTOK_ADS_UNREACHABLE] Could not reach ${url.host}: ${cause}.`);
    }

    if (response.ok) {
      const text = await response.text();
      let envelope: Envelope;
      try {
        envelope = JSON.parse(text) as Envelope;
      } catch {
        throw new ApiError(
          response.status,
          `[TIKTOK_ADS_ERROR] ${url.host} answered with something that is not JSON: ${cap(text, 200)}`,
        );
      }
      if (envelope.code !== 0) throw envelopeError(envelope);
      return (envelope.data ?? {}) as T;
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
    const detail = cap(text);
    const code = response.status === 429 ? 'RATE_LIMITED' : 'TIKTOK_ADS_ERROR';
    throw new ApiError(
      response.status,
      `[${code}] ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`,
    );
  }
}
