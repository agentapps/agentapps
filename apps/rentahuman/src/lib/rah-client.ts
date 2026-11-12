/**
 * RentAHuman API client.
 *
 * Stateless: the API key is read from `context.secrets.getInstallation()` on every call.
 * Auth uses the `X-API-Key` header. Destination is the fixed host
 * `rentahuman.ai`, so a plain `fetch` is safe — no SSRF surface.
 *
 * Retries: only idempotent GETs are retried on transient errors (429/5xx) with
 * exponential backoff + jitter, honoring `Retry-After` clamped to 30s.
 * POST/PUT/DELETE are NEVER retried.
 *
 * Note: search and browse operations do NOT require an API key.
 */

import { classifyRahError, RahApiError } from './_rah-error.js';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

const RAH_BASE_URL = 'https://rentahuman.ai/api';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_GET_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 30_000;

export interface RahRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Query params — `undefined`/`null` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON request body (object). Serialized with JSON.stringify. */
  body?: unknown;
  /** If true, skip API key requirement (for public endpoints). */
  publicEndpoint?: boolean;
}

async function getApiKey(context: SecretsContext): Promise<string> {
  let secrets: Record<string, string> = {};
  try {
    const installationSecrets = await context.secrets.getInstallation();
    if (installationSecrets) secrets = installationSecrets;
  } catch {
    // fall through to the missing-key error below
  }
  const key = secrets.RENTAHUMAN_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new RahApiError('AUTH_INVALID', 401, 'RentAHuman API key not configured.', {
      type: 'user_action',
      description:
        'Add your RentAHuman API key (starts with rah_) in app settings to enable bookings.',
    });
  }
  return key.trim();
}

async function getOptionalApiKey(context: SecretsContext): Promise<string | undefined> {
  try {
    const installationSecrets = await context.secrets.getInstallation();
    if (installationSecrets) {
      const key = installationSecrets.RENTAHUMAN_API_KEY;
      if (key && key.trim().length > 0) return key.trim();
    }
  } catch {
    // no secrets available
  }
  return undefined;
}

function buildUrl(endpoint: string, query?: RahRequestOptions['query']): string {
  const url = new URL(`${RAH_BASE_URL}${endpoint}`);
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
  const base = 800 * 2 ** attempt;
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
 * Make a request to the RentAHuman API.
 * For public endpoints (search, get-human), set `publicEndpoint: true` to skip
 * the API key requirement.
 */
export async function rahRequest<T = unknown>(
  context: SecretsContext,
  endpoint: string,
  options: RahRequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const url = buildUrl(endpoint, options.query);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.publicEndpoint) {
    const optionalKey = await getOptionalApiKey(context);
    if (optionalKey) headers['X-API-Key'] = optionalKey;
  } else {
    const apiKey = await getApiKey(context);
    headers['X-API-Key'] = apiKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  const doFetch = (): Promise<Response> =>
    fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

  const maxAttempts = method === 'GET' ? MAX_GET_RETRIES + 1 : 1;
  let lastResponse: Response | null = null;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await doFetch();
      if (response.ok) return parseSuccessBody<T>(response);

      lastResponse = response;
      const canRetry = attempt < maxAttempts - 1 && RETRYABLE_STATUS.has(response.status);
      if (!canRetry) break;
      await sleep(backoffMs(attempt, response.headers.get('retry-after')));
    }
  } finally {
    clearTimeout(timeout);
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
  const classified = classifyRahError(response.status, parsed);
  throw new RahApiError(classified.code, response.status, classified.message, classified.action);
}
