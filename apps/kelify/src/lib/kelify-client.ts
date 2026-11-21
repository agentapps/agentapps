/**
 * Kelify API client.
 *
 * Stateless: the API key is read from `ctx.secrets.getSystem()` on every call
 * (per the MCA manifest's `systemSecrets: ["KELIFY_API_KEY"]`).
 * Auth is Bearer token. Destination is the Kelify API host.
 *
 * Replaces the original axios-based client with plain `fetch` + `AbortController`.
 *
 * Retries: only idempotent GETs are retried on transient errors (429/5xx) with
 * exponential backoff + jitter, honoring `Retry-After` clamped to 30s.
 * POST requests are NEVER retried — without an idempotency key a retry could
 * create duplicate conversations or send duplicate messages.
 */

import { classifyKelifyError, KelifyApiError } from './_kelify-error.js';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

const KELIFY_API_BASE = 'https://api.kelify.com';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_GET_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 30_000;
const REQUEST_TIMEOUT_MS = 30_000;

export interface KelifyRequestOptions {
  method?: 'GET' | 'POST';
  /** JSON request body (object). Serialized with JSON.stringify. */
  body?: unknown;
}

async function getApiKey(context: SecretsContext): Promise<string> {
  let secrets: Record<string, string> = {};
  try {
    const systemSecrets = await context.secrets.getSystem();
    if (systemSecrets) secrets = systemSecrets;
  } catch {
    // fall through to the missing-key error below
  }
  const key = secrets.KELIFY_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new KelifyApiError('AUTH_INVALID', 401, 'Kelify API key not configured.', {
      type: 'user_action',
      description: 'Add the KELIFY_API_KEY system secret in the app settings.',
    });
  }
  return key.trim();
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
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function kelifyRequest<T = unknown>(
  context: SecretsContext,
  endpoint: string,
  options: KelifyRequestOptions = {},
): Promise<T> {
  const apiKey = await getApiKey(context);
  const method = options.method ?? 'GET';
  const baseUrl = KELIFY_API_BASE;
  const url = `${baseUrl}${endpoint}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const doFetch = (): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    return fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  };

  const maxAttempts = method === 'GET' ? MAX_GET_RETRIES + 1 : 1;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await doFetch();
    if (response.ok) return parseSuccessBody<T>(response);

    lastResponse = response;
    const canRetry = attempt < maxAttempts - 1 && RETRYABLE_STATUS.has(response.status);
    if (!canRetry) break;
    await sleep(backoffMs(attempt, response.headers.get('retry-after')));
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
  const classified = classifyKelifyError(response.status, parsed);
  throw new KelifyApiError(classified.code, response.status, classified.message, classified.action);
}
