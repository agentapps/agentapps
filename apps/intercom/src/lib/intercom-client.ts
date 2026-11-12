/**
 * Intercom API client.
 *
 * Stateless: the access token is read from `ctx.secrets.getInstallation()` on every call
 * (per-app container -> each user's own token). Auth is Bearer token.
 * Destination is the fixed host `api.intercom.io`, so a plain `fetch` is safe —
 * no SSRF surface.
 *
 * Retries: only idempotent GETs are retried on transient errors (429/5xx) with
 * exponential backoff + jitter, honoring `Retry-After` clamped to 30s.
 * POST/PUT/DELETE are NEVER retried — without an idempotency key a retry could
 * duplicate side effects.
 */

import { classifyIntercomError, IntercomApiError } from './_intercom-error.js';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

const INTERCOM_API_BASE = 'https://api.intercom.io';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_GET_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 30_000;

export interface IntercomRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** JSON request body (object). Serialized with JSON.stringify. */
  body?: unknown;
}

async function getAccessToken(context: SecretsContext): Promise<string> {
  let secrets: Record<string, string> = {};
  try {
    const installationSecrets = await context.secrets.getInstallation();
    if (installationSecrets) secrets = installationSecrets;
  } catch {
    // fall through to the missing-token error below
  }
  const token = secrets.ACCESS_TOKEN;
  if (!token || token.trim().length === 0) {
    throw new IntercomApiError('AUTH_INVALID', 401, 'Intercom ACCESS_TOKEN not configured.', {
      type: 'user_action',
      description:
        'Add your Intercom Access Token in the app settings (Intercom Developer Hub → your app → Authentication → Access Token).',
    });
  }
  return token.trim();
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
  if (response.status === 204) return { success: true } as T;
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function intercomRequest<T = unknown>(
  context: SecretsContext,
  path: string,
  options: IntercomRequestOptions = {},
): Promise<T> {
  const token = await getAccessToken(context);
  const method = options.method ?? 'GET';
  const url = `${INTERCOM_API_BASE}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const doFetch = (): Promise<Response> =>
    fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

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

  // Non-OK after (optional) retries -> classify + throw.
  const response = lastResponse as Response;
  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // keep raw text for the message
  }
  const classified = classifyIntercomError(response.status, parsed);
  throw new IntercomApiError(
    classified.code,
    response.status,
    classified.message,
    classified.action,
  );
}

/** Helper to strip HTML tags from Intercom message bodies */
export function stripHtml(html: string): string {
  return (
    html
      ?.replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() ?? ''
  );
}
