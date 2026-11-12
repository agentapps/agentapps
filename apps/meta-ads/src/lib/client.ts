/**
 * HTTP client for the Meta Marketing API (Graph API).
 *
 * - One 30 s deadline per call, retries included, so a call always ends inside the
 *   host's 60 s tool budget with this client's own message
 * - Idempotent requests (GET, DELETE) retry on 429/500/502/503/504 and network errors,
 *   at most 3 attempts, honouring a short Retry-After; POST never retries
 * - Writes are sent form-encoded, the way Meta documents them; nested objects
 *   (targeting, promoted_object) are JSON strings inside the form
 * - Graph API errors ({ error: { code, error_subcode, message, ... } }) become messages with
 *   a bracketed code and the next step. Meta reports rate limits as HTTP 400 with codes
 *   4/17/32/613/80000-80014, so they are mapped here, not by status
 * - Installation secrets are read on every call, never cached in module state; the token travels
 *   in the Authorization header only, so it never appears in a URL or an error message
 */

/** Pinned Graph API version. Meta keeps each version for about two years. */
export const GRAPH_API_VERSION = 'v26.0';
export const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** Installation secrets this app declares in agentapp.json. Every one is required. */
export const REQUIRED_SECRETS: readonly string[] = ['META_ACCESS_TOKEN'];

export const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 5_000;
const MAX_ERROR_BODY_CHARS = 2_000;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * The part of the SDK tool and health contexts the client uses. `secrets` is listed
 * even when the app has no auth so that both contexts fit this type.
 */
export interface ClientContext {
  secrets: { getInstallation(): Promise<Record<string, string> | null> };
  signal?: AbortSignal;
}

export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  /** Query string. Arrays are joined with commas (Graph's `fields` syntax). */
  params?: Record<string, QueryValue | QueryValue[]>;
  /** Form fields for POST. Objects and arrays are sent as JSON strings. */
  form?: Record<string, unknown>;
  /** Overall deadline for the call, retries included (health checks use a shorter one). */
  timeoutMs?: number;
}

/** Thrown for non-2xx responses so callers can branch on the status and Graph error code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly graphCode?: number,
    readonly graphSubcode?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const CONFIG_HINT = 'Set it with `agentapps config <alias> META_ACCESS_TOKEN:<token>`.';

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

function buildUrl(path: string, params?: RequestOptions['params']): URL {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      const parts = value.filter((v) => v !== undefined);
      if (parts.length > 0) url.searchParams.set(key, parts.join(','));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildForm(form: Record<string, unknown>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(form)) {
    if (value === undefined) continue;
    body.set(
      key,
      typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value),
    );
  }
  return body;
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

interface GraphErrorBody {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
}

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

/** Bracketed code and next step for a Graph API error code. */
function classify(status: number, code: number | undefined, subcode?: number): [string, string] {
  if (code === 190 || code === 102 || status === 401) {
    return [
      'AUTH_REQUIRED',
      `The access token is invalid or expired. Generate a new one (a System User token does not expire). ${CONFIG_HINT}`,
    ];
  }
  if (code !== undefined && (RATE_LIMIT_CODES.has(code) || (code >= 80000 && code <= 80014))) {
    return [
      'RATE_LIMITED',
      'Meta throttled this app or ad account. Wait a few minutes before retrying, and request fewer rows or fields.',
    ];
  }
  if (code === 10 || (code !== undefined && code >= 200 && code <= 299) || subcode === 3191001) {
    return [
      'FORBIDDEN',
      'The token lacks a permission or access to this object. Reads need ads_read, writes need ads_management, and the System User (or user) must be assigned to the ad account in Business Settings.',
    ];
  }
  if (code === 803 || (code === 100 && subcode === 33)) {
    return ['NOT_FOUND', 'Check the id, and that the token can see the ad account that owns it.'];
  }
  if (code === 100) return ['BAD_REQUEST', 'Fix the parameter named above and retry.'];
  if (code === 1 || code === 2) {
    return [
      'META_ADS_ERROR',
      'A temporary Meta error. Retry later; for insights, try a shorter date range or fewer fields.',
    ];
  }
  if (status === 404) return ['NOT_FOUND', 'Check the id.'];
  if (status === 429) return ['RATE_LIMITED', 'Wait before retrying.'];
  return ['META_ADS_ERROR', 'Retry later; if it persists, quote the fbtrace_id to Meta support.'];
}

function errorFrom(response: Response, text: string): ApiError {
  let graph: GraphErrorBody | undefined;
  try {
    const parsed = JSON.parse(text) as { error?: GraphErrorBody };
    if (parsed && typeof parsed.error === 'object') graph = parsed.error;
  } catch {
    // Not JSON: quote the raw body below.
  }
  if (!graph) {
    const detail =
      text.length > MAX_ERROR_BODY_CHARS ? `${text.slice(0, MAX_ERROR_BODY_CHARS)}...` : text;
    const [label, hint] = classify(response.status, undefined);
    return new ApiError(
      response.status,
      `[${label}] ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}. ${hint}`,
    );
  }
  const [label, hint] = classify(response.status, graph.code, graph.error_subcode);
  const codes = `${graph.code ?? '?'}${graph.error_subcode ? `/${graph.error_subcode}` : ''}`;
  let detail = graph.message ?? 'no message';
  if (graph.error_user_msg && graph.error_user_msg !== graph.message) {
    detail += ` (${graph.error_user_title ? `${graph.error_user_title}: ` : ''}${graph.error_user_msg})`;
  }
  if (detail.length > MAX_ERROR_BODY_CHARS) detail = `${detail.slice(0, MAX_ERROR_BODY_CHARS)}...`;
  const trace = graph.fbtrace_id ? ` fbtrace_id ${graph.fbtrace_id}.` : '';
  return new ApiError(
    response.status,
    `[${label}] Meta API error ${codes} (HTTP ${response.status}): ${detail}. ${hint}${trace}`,
    graph.code,
    graph.error_subcode,
  );
}

/** Calls the Graph API and returns the parsed JSON body. */
export async function apiRequest<T = unknown>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  ctx: ClientContext,
  options: RequestOptions = {},
): Promise<T> {
  const secrets = await getSecrets(ctx);
  const url = buildUrl(path, options.params);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    // Never log or echo this header.
    Authorization: `Bearer ${secrets.META_ACCESS_TOKEN}`,
  };
  let body: URLSearchParams | undefined;
  if (options.form !== undefined) {
    body = buildForm(options.form);
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = ctx.signal ? AbortSignal.any([deadline, ctx.signal]) : deadline;
  const retries = method === 'GET' || method === 'DELETE';

  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { method, headers, body, signal });
    } catch (err) {
      if (deadline.aborted) {
        throw new Error(
          `[META_ADS_TIMEOUT] ${url.host} did not answer within ${timeoutMs / 1000} s. For insights, try a shorter date range, fewer breakdowns or a smaller limit.`,
        );
      }
      if (signal.aborted) throw new Error('[CANCELLED] The request was cancelled.');
      if (retries && attempt < MAX_ATTEMPTS) {
        await sleep(250 * 2 ** (attempt - 1), signal);
        continue;
      }
      const cause = (err as { cause?: { code?: string } })?.cause?.code ?? String(err);
      throw new Error(`[META_ADS_UNREACHABLE] Could not reach ${url.host}: ${cause}.`);
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
    throw errorFrom(response, text);
  }
}
