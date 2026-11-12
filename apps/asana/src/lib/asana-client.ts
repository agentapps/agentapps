/**
 * Asana REST API v1 client.
 *
 * Stateless: the access token is read from `ctx.secrets.getInstallation()` on every call.
 * Auth uses the `Authorization: Bearer <token>` header.
 *
 * Asana wraps all JSON responses in `{ data: ... }`. This client unwraps
 * automatically, returning only the `data` portion.
 *
 * Retries: only idempotent GETs are retried on transient errors (429/5xx) with
 * exponential backoff + jitter, honoring `Retry-After` clamped to 30s.
 * POST/PUT are NEVER retried — a retry could duplicate resources.
 */

import { AsanaApiError, classifyAsanaError } from './_asana-error.js';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

const ASANA_API_BASE = 'https://app.asana.com/api/1.0';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_GET_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 30_000;

export interface AsanaRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Query params — `undefined`/`null` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON request body (object). Serialized inside `{ data: ... }`. */
  body?: unknown;
}

export async function getAsanaToken(context: SecretsContext): Promise<string> {
  let secrets: Record<string, string> = {};
  try {
    const installationSecrets = await context.secrets.getInstallation();
    if (installationSecrets) secrets = installationSecrets;
  } catch {
    // fall through to the missing-key error below
  }
  const token = secrets.ACCESS_TOKEN;
  if (!token || token.trim().length === 0) {
    throw new AsanaApiError('AUTH_INVALID', 401, 'Asana access token not configured.', {
      type: 'user_action',
      description:
        'Add your Asana Personal Access Token in the app settings (Asana → My Settings → Apps → Personal Access Tokens).',
    });
  }
  return token.trim();
}

function buildUrl(endpoint: string, query?: AsanaRequestOptions['query']): string {
  const url = new URL(`${ASANA_API_BASE}/${endpoint}`);
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
    const parsed = JSON.parse(text);
    // Asana wraps responses in { data: ... }
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      return parsed.data as T;
    }
    return parsed as T;
  } catch {
    return text as unknown as T;
  }
}

export async function asanaRequest<T = unknown>(
  context: SecretsContext,
  endpoint: string,
  options: AsanaRequestOptions = {},
): Promise<T> {
  const apiToken = await getAsanaToken(context);
  const method = options.method ?? 'GET';
  const url = buildUrl(endpoint, options.query);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

  const requestBody =
    options.body !== undefined ? JSON.stringify({ data: options.body }) : undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  const doFetch = (): Promise<Response> =>
    fetch(url, {
      method,
      headers,
      body: requestBody,
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

  // Non-OK after (optional) retries — classify + throw.
  const response = lastResponse as Response;
  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // keep raw text for the message
  }
  const classified = classifyAsanaError(response.status, parsed);
  throw new AsanaApiError(classified.code, response.status, classified.message, classified.action);
}
