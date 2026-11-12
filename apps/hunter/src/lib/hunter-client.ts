/**
 * Hunter.io API client.
 *
 * Stateless: the API key is read from `ctx.secrets.getInstallation()` on every call
 * (per-app container -> each user's own key). Auth is the `X-API-KEY` HEADER
 * (keeps the secret out of URLs, logs and referrers — CWE-598).
 *
 * Destination is the fixed host `api.hunter.io`, so a plain `fetch` is safe —
 * no SSRF surface. Retries: only idempotent GETs are retried on transient
 * errors (403 rate-limit / 5xx) with exponential backoff + jitter, honoring
 * `Retry-After` clamped to 30s. A `202` from the email-verifier means "still
 * processing" — polled within the retry budget.
 */

import { classifyHunterError, HunterApiError } from './_hunter-error.js';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

const HUNTER_BASE_URL = 'https://api.hunter.io/v2';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_GET_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 30_000;
const RETRYABLE_STATUS = new Set([403, 500, 502, 503, 504]);

export interface HunterRequestOptions {
  /** Query params — `undefined`/`null` values are dropped. */
  query?: Record<string, string | number | undefined>;
  /** Timeout in ms (default 15000). */
  timeoutMs?: number;
  /** Max retries for GET (default 2). Set 0 to disable. */
  maxRetries?: number;
}

/** Pagination/metadata Hunter returns alongside `data`. */
export interface HunterMeta {
  results?: number;
  limit?: number;
  offset?: number;
  params?: Record<string, unknown>;
}

/** Every successful Hunter response is wrapped in `{ data, meta }`. */
export interface HunterEnvelope<T> {
  data: T;
  meta?: HunterMeta;
}

async function getApiKey(context: SecretsContext): Promise<string> {
  let secrets: Record<string, string> = {};
  try {
    const installationSecrets = await context.secrets.getInstallation();
    if (installationSecrets) secrets = installationSecrets;
  } catch {
    // fall through to the missing-key error below
  }
  const key = secrets.HUNTER_API_KEY ?? secrets.hunter_api_key;
  if (!key || key.trim().length === 0) {
    throw new HunterApiError('AUTH_INVALID', 401, 'Hunter API key not configured.', {
      type: 'user_action',
      description: 'Add your Hunter API key in the app settings (get one at hunter.io/api-keys).',
    });
  }
  return key.trim();
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(`${HUNTER_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function jitter(): number {
  return Math.round((Math.random() * 2 - 1) * 400); // +/-400ms
}

function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
    }
  }
  const base = [800, 2000, 5000][attempt] ?? 5000;
  return Math.max(0, base + jitter());
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Perform a GET against the Hunter API and return the full `{ data, meta }`
 * envelope. Throws a typed `HunterApiError` on any non-2xx response (and on a
 * persistently `202` email-verifier).
 */
export async function hunterGetEnvelope<T = unknown>(
  context: SecretsContext,
  path: string,
  options: HunterRequestOptions = {},
): Promise<HunterEnvelope<T>> {
  const apiKey = await getApiKey(context);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? MAX_GET_RETRIES;
  const url = buildUrl(path, options.query);

  const maxAttempts = maxRetries + 1;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json', 'X-API-KEY': apiKey },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (attempt < maxAttempts - 1) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw new HunterApiError(
        'PROVIDER_ERROR',
        0,
        err instanceof Error ? err.message : 'Network error contacting Hunter API',
        { type: 'auto_retry', description: 'Network error reaching api.hunter.io; retry later.' },
      );
    } finally {
      clearTimeout(timer);
    }

    // 202 = email-verifier still processing. Poll within the retry budget.
    if (res.status === 202) {
      await res.text().catch(() => undefined);
      lastResponse = res;
      if (attempt < maxAttempts - 1) {
        await sleep(backoffMs(attempt, null));
        continue;
      }
      throw new HunterApiError(
        'PENDING',
        202,
        'Hunter is still verifying this email; the result is not ready yet (try again shortly).',
        { type: 'auto_retry', description: 'Verification pending; retry shortly.' },
      );
    }

    if (res.ok) {
      clearTimeout(timer);
      const text = await res.text();
      try {
        const json = JSON.parse(text) as HunterEnvelope<T>;
        return { data: json.data, meta: json.meta };
      } catch {
        throw new HunterApiError(
          'PROVIDER_ERROR',
          res.status,
          `Hunter returned a non-JSON body: ${text.slice(0, 120)}`,
          { type: 'auto_retry', description: 'Unexpected response from Hunter API.' },
        );
      }
    }

    lastResponse = res;
    const canRetry = attempt < maxAttempts - 1 && RETRYABLE_STATUS.has(res.status);
    if (!canRetry) break;
    await sleep(backoffMs(attempt, res.headers.get('retry-after')));
  }

  // Non-OK after (optional) retries -> classify + throw.
  const response = lastResponse as Response;
  const raw = await response.text();
  const classified = classifyHunterError(response.status, raw);
  throw new HunterApiError(classified.code, response.status, classified.message, classified.action);
}

/**
 * Convenience wrapper returning just the parsed `data` payload — the common
 * case. Use `hunterGetEnvelope` when you also need `meta` (e.g. pagination
 * totals from `meta.results`).
 */
export async function hunterGet<T = unknown>(
  context: SecretsContext,
  path: string,
  options: HunterRequestOptions = {},
): Promise<T> {
  const { data } = await hunterGetEnvelope<T>(context, path, options);
  return data;
}
