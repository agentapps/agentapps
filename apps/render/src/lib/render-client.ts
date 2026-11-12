/**
 * Render API client.
 *
 * Stateless: the API key is read from `ctx.secrets.getInstallation()` on every call
 * (per-app container -- each user's own key). Auth is `Bearer` token header.
 * Destination is the fixed host `api.render.com`, so a plain `fetch` is safe.
 *
 * Retries: only idempotent GETs are retried on transient errors (429/5xx) with
 * exponential backoff + jitter, honoring `Retry-After` clamped to 30s.
 * POST/PUT/DELETE are NEVER retried.
 */

import { classifyRenderError, RenderApiError } from './_render-error.js';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

const RENDER_API_BASE = 'https://api.render.com/v1';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_GET_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 30_000;

export interface RenderRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Query params -- `undefined`/`null` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON request body (object). Serialized with JSON.stringify. */
  body?: unknown;
}

async function getApiKey(context: SecretsContext): Promise<string> {
  let secrets: Record<string, string> = {};
  try {
    const installationSecrets = await context.secrets.getInstallation();
    if (installationSecrets) secrets = installationSecrets;
  } catch {
    // fall through to the missing-key error below
  }
  const key = secrets.RENDER_API_KEY || secrets.renderApiKey;
  if (!key || key.trim().length === 0) {
    throw new RenderApiError('AUTH_INVALID', 401, 'Render API key not configured.', {
      type: 'user_action',
      description:
        'Add your RENDER_API_KEY in the app settings. Get your key from https://dashboard.render.com/u/settings#api-keys.',
    });
  }
  return key.trim();
}

function buildUrl(endpoint: string, query?: RenderRequestOptions['query']): string {
  const url = new URL(`${RENDER_API_BASE}${endpoint}`);
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
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export async function renderRequest<T = unknown>(
  context: SecretsContext,
  endpoint: string,
  options: RenderRequestOptions = {},
): Promise<T> {
  const apiKey = await getApiKey(context);
  const method = options.method ?? 'GET';
  const url = buildUrl(endpoint, options.query);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

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

  // Non-OK after (optional) retries -- classify + throw.
  const response = lastResponse as Response;
  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // keep raw text for the message
  }
  const classified = classifyRenderError(response.status, parsed);
  throw new RenderApiError(classified.code, response.status, classified.message, classified.action);
}

// =============================================================================
// Render logs endpoint uses a custom URL pattern with repeated serviceId[]
// query params, so it needs its own request function.
// =============================================================================

export async function renderLogsRequest<T = unknown>(
  context: SecretsContext,
  ownerId: string,
  serviceIds: string[],
  query: Record<string, string | number | undefined> = {},
): Promise<T> {
  const apiKey = await getApiKey(context);

  let url = `${RENDER_API_BASE}/logs?ownerId=${encodeURIComponent(ownerId)}`;
  for (const id of serviceIds) {
    url += `&serviceId[]=${encodeURIComponent(id)}`;
  }
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url += `&${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
    }
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const raw = await response.text();
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // keep raw text
    }
    const classified = classifyRenderError(response.status, parsed);
    throw new RenderApiError(
      classified.code,
      response.status,
      classified.message,
      classified.action,
    );
  }

  return parseSuccessBody<T>(response);
}
