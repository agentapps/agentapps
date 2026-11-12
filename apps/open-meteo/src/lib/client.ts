/**
 * HTTP client for the Open-Meteo APIs.
 *
 * - Open-Meteo is free and needs no key, so there are no secrets to read
 * - The service is split over three hosts (geocoding, forecast, archive). Each tool picks its
 *   host from the fixed `HOSTS` table; a host never comes from tool arguments
 * - One 30 s budget covers the whole call, retries included, well inside the host's 60 s
 * - 429/502/503/504 are retried up to 3 attempts with a short, capped back-off
 * - Network failures name the host; quoted error bodies are capped
 */

export const HOSTS = {
  geocoding: 'https://geocoding-api.open-meteo.com',
  forecast: 'https://api.open-meteo.com',
  archive: 'https://archive-api.open-meteo.com',
} as const;

export type HostName = keyof typeof HOSTS;

/** The forecast host: used by the health check. */
export const BASE_URL = HOSTS.forecast;

export const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ERROR_BODY_CHARS = 2_000;
const MAX_ATTEMPTS = 3;
/** Longest Retry-After we are willing to wait; a longer one means a daily or hourly quota. */
const MAX_RETRY_WAIT_MS = 5_000;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

/** The part of the SDK tool/health context the client needs. */
export interface ClientContext {
  signal?: AbortSignal;
}

export type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  /** Which Open-Meteo API to call. Defaults to the forecast API. */
  host?: HostName;
  params?: Record<string, QueryValue | QueryValue[]>;
  /** Overrides the default timeout (health checks use a shorter one). */
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

function buildUrl(host: HostName, path: string, params?: RequestOptions['params']): URL {
  const url = new URL(`${HOSTS[host]}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      const parts = value.filter((v) => v !== undefined);
      if (parts.length > 0) url.searchParams.set(key, parts.join(','));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  // Send list separators as literal commas, as Open-Meteo documents. With an encoded "%2C" the
  // API still accepts valid lists, but its error then names the whole list instead of the one
  // bad variable (seen in the live test).
  url.search = url.searchParams.toString().replace(/%2C/gi, ',');
  return url;
}

/** Seconds or HTTP-date from a Retry-After header, in ms; undefined when absent or invalid. */
function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Turns an Open-Meteo error response into a self-explaining error. */
async function toApiError(response: Response): Promise<ApiError> {
  const text = await response.text().catch(() => '');
  let reason: string | undefined;
  try {
    const body = JSON.parse(text) as { error?: unknown; reason?: unknown };
    if (body && body.error === true && typeof body.reason === 'string') reason = body.reason;
  } catch {
    // Not JSON: quote the (capped) text below.
  }
  if (response.status === 400 && reason) {
    return new ApiError(400, `[BAD_REQUEST] Open-Meteo rejected the request: ${reason}`);
  }
  if (response.status === 429) {
    return new ApiError(
      429,
      '[RATE_LIMITED] Open-Meteo rate limit reached (free tier: 600 calls/min, 5,000/hour, ' +
        `10,000/day). Wait and retry later.${reason ? ` ${reason}` : ''}`,
    );
  }
  const raw = reason ?? text;
  const detail =
    raw.length > MAX_ERROR_BODY_CHARS ? `${raw.slice(0, MAX_ERROR_BODY_CHARS)}...` : raw;
  return new ApiError(
    response.status,
    `[OPEN_METEO_ERROR] ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`,
  );
}

/** Calls an Open-Meteo API with GET and returns the parsed JSON body. */
export async function apiGet<T = unknown>(
  path: string,
  ctx: ClientContext,
  options: RequestOptions = {},
): Promise<T> {
  const host = options.host ?? 'forecast';
  const url = buildUrl(host, path, options.params);
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  // One deadline for every attempt, so retries can never exceed the tool's time budget.
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (ctx.signal) signals.push(ctx.signal);
  const signal = AbortSignal.any(signals);

  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      });
    } catch (err) {
      throw networkError(err, url, timeoutMs);
    }

    if (response.ok) return (await response.json()) as T;

    if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_ATTEMPTS) {
      const wait = retryAfterMs(response.headers.get('retry-after')) ?? 500 * 2 ** (attempt - 1);
      if (wait <= MAX_RETRY_WAIT_MS) {
        await response.body?.cancel().catch(() => {});
        try {
          await sleep(wait, signal);
        } catch (err) {
          throw networkError(err, url, timeoutMs);
        }
        continue;
      }
    }
    throw await toApiError(response);
  }
}

function networkError(err: unknown, url: URL, timeoutMs: number): Error {
  const name = (err as { name?: string })?.name;
  if (name === 'TimeoutError') {
    return new Error(
      `[OPEN_METEO_TIMEOUT] ${url.host} did not answer within ${timeoutMs / 1000} s.`,
    );
  }
  if (name === 'AbortError') return new Error('[CANCELLED] The request was cancelled.');
  const cause = (err as { cause?: { code?: string } })?.cause?.code ?? String(err);
  return new Error(`[OPEN_METEO_UNREACHABLE] Could not reach ${url.host}: ${cause}.`);
}
