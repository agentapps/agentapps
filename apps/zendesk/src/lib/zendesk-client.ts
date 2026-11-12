/**
 * Zendesk API client.
 *
 * Stateless: credentials are read from `context.secrets.getInstallation()` on every
 * call (per-app container — each user's own key). Auth is Basic Auth with
 * `email/token:apiToken`. Destination is `<subdomain>.zendesk.com`, so a plain
 * `fetch` is safe — no SSRF surface.
 *
 * Retries: only idempotent GETs are retried on transient errors (429/5xx) with
 * exponential backoff + jitter, honoring `Retry-After` clamped to 30s.
 * POST/PUT/DELETE are NEVER retried.
 */

import { classifyZendeskError, ZendeskApiError } from './_zendesk-error.js';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_GET_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 30_000;

export interface ZendeskRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Query params — `undefined`/`null` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON request body (object). Serialized with JSON.stringify. */
  body?: unknown;
}

function getBaseUrl(subdomain: string): string {
  return `https://${subdomain}.zendesk.com/api/v2`;
}

function encodeAuth(email: string, apiToken: string): string {
  return btoa(`${email}/token:${apiToken}`);
}

async function getCredentials(
  context: SecretsContext,
): Promise<{ subdomain: string; email: string; apiToken: string }> {
  let secrets: Record<string, string> = {};
  try {
    const installationSecrets = await context.secrets.getInstallation();
    if (installationSecrets) secrets = installationSecrets;
  } catch {
    // fall through to the missing-credential error below
  }

  const subdomain = secrets.SUBDOMAIN;
  const email = secrets.EMAIL;
  const apiToken = secrets.API_TOKEN;

  if (!subdomain || !email || !apiToken) {
    const missing: string[] = [];
    if (!subdomain) missing.push('SUBDOMAIN');
    if (!email) missing.push('EMAIL');
    if (!apiToken) missing.push('API_TOKEN');
    throw new ZendeskApiError(
      'AUTH_INVALID',
      401,
      `Zendesk secrets missing: ${missing.join(', ')}`,
      {
        type: 'user_action',
        description: 'Configure SUBDOMAIN, EMAIL, and API_TOKEN in app settings.',
      },
    );
  }

  return { subdomain: subdomain.trim(), email: email.trim(), apiToken: apiToken.trim() };
}

function buildUrl(subdomain: string, path: string, query?: ZendeskRequestOptions['query']): string {
  const url = new URL(`${getBaseUrl(subdomain)}${path}`);
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
  if (response.status === 204) return { success: true } as T;
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function zendeskRequest<T = unknown>(
  context: SecretsContext,
  path: string,
  options: ZendeskRequestOptions = {},
): Promise<T> {
  const { subdomain, email, apiToken } = await getCredentials(context);
  const method = options.method ?? 'GET';
  const url = buildUrl(subdomain, path, options.query);

  const headers: Record<string, string> = {
    Authorization: `Basic ${encodeAuth(email, apiToken)}`,
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

  // Non-OK after (optional) retries — classify + throw.
  const response = lastResponse as Response;
  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // keep raw text for the message
  }
  const classified = classifyZendeskError(response.status, parsed);
  throw new ZendeskApiError(
    classified.code,
    response.status,
    classified.message,
    classified.action,
  );
}

/**
 * Validate Zendesk credentials by making a real API call.
 */
export async function validateCredentials(context: SecretsContext): Promise<void> {
  await zendeskRequest(context, '/users/me.json');
}
