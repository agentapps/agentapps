/**
 * Todoist REST API v2 client.
 *
 * Stateless: the API token is read from `ctx.secrets.getInstallation()` on every call.
 * Auth uses the `Authorization: Bearer <token>` header.
 *
 * Retries: only idempotent GETs are retried on transient errors (429/5xx) with
 * exponential backoff + jitter, honoring `Retry-After` clamped to 30s.
 * POST/DELETE are NEVER retried — a retry could duplicate resources.
 */

import { classifyTodoistError, TodoistApiError } from './_todoist-error.js';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

const TODOIST_API_BASE = 'https://api.todoist.com/rest/v2';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_GET_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 30_000;

export interface TodoistRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  /** Query params — `undefined`/`null` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON request body (object). Serialized with JSON.stringify. */
  body?: unknown;
}

async function getApiToken(context: SecretsContext): Promise<string> {
  let secrets: Record<string, string> = {};
  try {
    const installationSecrets = await context.secrets.getInstallation();
    if (installationSecrets) secrets = installationSecrets;
  } catch {
    // fall through to the missing-key error below
  }
  const token = secrets.TODOIST_API_TOKEN;
  if (!token || token.trim().length === 0) {
    throw new TodoistApiError('AUTH_INVALID', 401, 'Todoist API token not configured.', {
      type: 'user_action',
      description:
        'Add your Todoist API token in the app settings (Todoist → Settings → Integrations → Developer → API token).',
    });
  }
  return token.trim();
}

function buildUrl(endpoint: string, query?: TodoistRequestOptions['query']): string {
  const url = new URL(`${TODOIST_API_BASE}${endpoint}`);
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

export async function todoistRequest<T = unknown>(
  context: SecretsContext,
  endpoint: string,
  options: TodoistRequestOptions = {},
): Promise<T> {
  const apiToken = await getApiToken(context);
  const method = options.method ?? 'GET';
  const url = buildUrl(endpoint, options.query);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

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

  // Non-OK after (optional) retries — classify + throw.
  const response = lastResponse as Response;
  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // keep raw text for the message
  }
  const classified = classifyTodoistError(response.status, parsed);
  throw new TodoistApiError(
    classified.code,
    response.status,
    classified.message,
    classified.action,
  );
}
