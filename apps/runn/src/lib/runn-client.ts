/**
 * Runn API Client
 *
 * HTTP client for the Runn REST API (v1) with API-key (Bearer) auth. The API
 * key is pulled lazily from the tool context on every request so a credential
 * update takes effect immediately without restarting the app.
 *
 * Retries: only idempotent reads (GET) are retried on transient errors
 * (429/5xx) with exponential backoff + jitter, honoring `Retry-After`
 * clamped to 30s. Mutations (POST/PATCH/DELETE) are never retried — Runn
 * has no idempotency key, so a retry after partial success would duplicate
 * the record.
 */

import { classifyRunnError, RunnApiError } from './_runn-error.js';
import type { RunnPage } from './types.js';

export const RUNN_API_BASE = 'https://api.runn.io';
export const RUNN_API_VERSION = '1.0.0';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

export interface RunnRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: QueryParams;
}

// Retry policy: only idempotent reads (GET) and only transient statuses.
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [800, 2000, 5000];
const MAX_RETRY_AFTER_MS = 30_000;

function jitter(ms: number): number {
  return ms + Math.floor(Math.random() * 400);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildUrl(endpoint: string, query?: QueryParams): string {
  const url = new URL(`${RUNN_API_BASE}${endpoint}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Resolve the wait (ms) before a retry. Honours the `Retry-After` header
 * (seconds), clamped to {@link MAX_RETRY_AFTER_MS} to avoid hangs. Falls back
 * to the exponential schedule when the header is absent or non-numeric.
 */
export function resolveRetryDelay(retryAfterHeader: string | null, attempt: number): number {
  const fallback = RETRY_DELAYS_MS[attempt] ?? 5000;
  if (!retryAfterHeader) return fallback;
  const seconds = Number.parseInt(retryAfterHeader, 10);
  if (!Number.isFinite(seconds) || seconds < 0) return fallback;
  return Math.min(MAX_RETRY_AFTER_MS, seconds * 1000);
}

async function getApiKey(context: SecretsContext): Promise<string> {
  let secrets: Record<string, string> = {};
  try {
    const installationSecrets = await context.secrets.getInstallation();
    if (installationSecrets) secrets = installationSecrets;
  } catch {
    // fall through to the missing-key error below
  }
  const apiKey = secrets.API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new RunnApiError(
      'AUTH_REQUIRED',
      'Runn API key not configured. Please add your Runn API token in app settings.',
      {
        type: 'user_action',
        description:
          'Generate an API token in Runn (Settings > API, admin only) and paste it in app settings.',
      },
    );
  }
  return apiKey.trim();
}

/**
 * Make an authenticated request to the Runn API.
 *
 * - Throws {@link RunnApiError} `AUTH_REQUIRED` when no API key is configured.
 * - For idempotent reads (`GET`), retries up to {@link MAX_RETRIES} times on
 *   transient errors (429 rate-limit, 5xx) with exponential backoff + jitter,
 *   honouring `Retry-After` on 429 (clamped to 30s).
 * - Mutations (POST/PATCH/DELETE) skip retry.
 * - `204 No Content` resolves to `undefined`.
 */
export async function runnRequest<T>(
  endpoint: string,
  context: SecretsContext,
  options: RunnRequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const apiKey = await getApiKey(context);

  const url = buildUrl(endpoint, options.query);
  const hasBody = options.body !== undefined;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Accept-Version': RUNN_API_VERSION,
    Accept: 'application/json',
  };
  if (hasBody) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const init: RequestInit = {
    method,
    headers,
    body: hasBody ? JSON.stringify(options.body) : undefined,
    signal: controller.signal,
  };

  let attempt = 0;
  while (true) {
    const response = await fetch(url, init);

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }

    const shouldRetry =
      method === 'GET' && attempt < MAX_RETRIES && RETRY_STATUSES.has(response.status);

    if (!shouldRetry) {
      const body = await response.text();
      throw classifyRunnError(response.status, body, method, endpoint);
    }

    const delay = resolveRetryDelay(response.headers.get('retry-after'), attempt);
    await sleep(jitter(delay));
    attempt++;
  }
}

/**
 * Fetch a single page of a paginated Runn collection. Returns the canonical
 * `{ values, nextCursor }` envelope; the caller surfaces `nextCursor` to the
 * agent rather than auto-following every page (avoids context blow-up).
 */
export async function runnList<T>(
  endpoint: string,
  context: SecretsContext,
  params: { limit?: number; cursor?: string; query?: QueryParams } = {},
): Promise<RunnPage<T>> {
  const page = await runnRequest<RunnPage<T>>(endpoint, context, {
    method: 'GET',
    query: { ...params.query, limit: params.limit, cursor: params.cursor },
  });
  return { values: page?.values ?? [], nextCursor: page?.nextCursor ?? null };
}

/**
 * Validate Runn credentials by calling `GET /me`, which exercises the token.
 * Used by the health-check.
 */
export async function validateCredentials(context: SecretsContext): Promise<void> {
  await runnRequest('/me', context, { method: 'GET' });
}
