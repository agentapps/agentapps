/**
 * Mailchimp API client.
 *
 * Stateless: the API key is read from `context.secrets.getInstallation()` on every call
 * (per-app container -> each user's own key). Auth is Bearer token.
 *
 * The Mailchimp API key contains a datacenter suffix after the dash
 * (e.g. `abc123def-us21`). The base URL is derived from it:
 * `https://{dc}.api.mailchimp.com/3.0`.
 *
 * Retries: only idempotent GETs are retried on transient errors (429/5xx) with
 * exponential backoff + jitter, honoring `Retry-After` clamped to 30s.
 * POST/PUT/DELETE are NEVER retried — without an idempotency key a retry would
 * duplicate resources.
 */

import { classifyMailchimpError, MailchimpApiError } from './_mailchimp-error.js';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_GET_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 30_000;

export interface MailchimpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Query params — `undefined`/`null` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON request body (object). Serialized with JSON.stringify. */
  body?: unknown;
}

/**
 * Extract the datacenter suffix from a Mailchimp API key.
 * The key format is `<hash>-<dc>` (e.g. `abc123def456-us21`).
 */
function extractDatacenter(apiKey: string): string {
  const dashIndex = apiKey.lastIndexOf('-');
  if (dashIndex === -1 || dashIndex === apiKey.length - 1) {
    throw new MailchimpApiError(
      'AUTH_INVALID',
      401,
      'API key is missing the datacenter suffix (e.g. -us21).',
      {
        type: 'user_action',
        description:
          'The Mailchimp API key must contain a datacenter suffix after a dash (e.g. abc123-us21). Re-enter the full API key from Mailchimp Account -> Extras -> API Keys.',
      },
    );
  }
  return apiKey.slice(dashIndex + 1);
}

/**
 * Get auth details from the user's secrets. Returns the API key and the
 * derived base URL including the datacenter.
 */
export async function getMailchimpAuth(
  context: SecretsContext,
): Promise<{ apiKey: string; baseUrl: string }> {
  let secrets: Record<string, string> = {};
  try {
    const installationSecrets = await context.secrets.getInstallation();
    if (installationSecrets) secrets = installationSecrets;
  } catch {
    // fall through to the missing-key error below
  }
  const key = secrets.API_KEY;
  if (!key || key.trim().length === 0) {
    throw new MailchimpApiError('AUTH_INVALID', 401, 'Mailchimp API key not configured.', {
      type: 'user_action',
      description:
        'Add your Mailchimp API key in the app settings (Mailchimp Account -> Extras -> API Keys).',
    });
  }
  const apiKey = key.trim();
  const dc = extractDatacenter(apiKey);
  return { apiKey, baseUrl: `https://${dc}.api.mailchimp.com/3.0` };
}

function buildUrl(
  baseUrl: string,
  endpoint: string,
  query?: MailchimpRequestOptions['query'],
): string {
  const url = new URL(`${baseUrl}${endpoint}`);
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
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/**
 * Make an authenticated request to the Mailchimp API.
 *
 * @param context - Secrets context for retrieving the API key
 * @param endpoint - API path (e.g. `/lists`, `/campaigns/{id}`)
 * @param options - HTTP method, query params, and body
 */
export async function mailchimpRequest<T = unknown>(
  context: SecretsContext,
  endpoint: string,
  options: MailchimpRequestOptions = {},
): Promise<T> {
  const { apiKey, baseUrl } = await getMailchimpAuth(context);
  const method = options.method ?? 'GET';
  const url = buildUrl(baseUrl, endpoint, options.query);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    accept: 'application/json',
  };
  if (options.body !== undefined) headers['content-type'] = 'application/json';

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
  const classified = classifyMailchimpError(response.status, parsed);
  throw new MailchimpApiError(
    classified.code,
    response.status,
    classified.message,
    classified.action,
  );
}
