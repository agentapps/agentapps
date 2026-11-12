/**
 * Trello API client.
 *
 * Stateless: credentials are read from `ctx.secrets.getInstallation()` /
 * `ctx.secrets.getSystem()` on every call. Auth uses Trello's key + token
 * query-param model. Retries only idempotent GETs on transient errors
 * (429/5xx) with exponential backoff + jitter.
 */

import { classifyTrelloError, TrelloApiError } from './_trello-error.js';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

const TRELLO_API_BASE = 'https://api.trello.com/1';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_GET_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 30_000;

export interface TrelloRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Query params — `undefined`/`null` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON request body (object). Serialized with JSON.stringify. */
  body?: unknown;
}

interface TrelloCredentials {
  apiKey: string;
  token: string;
}

async function getCredentials(context: SecretsContext): Promise<TrelloCredentials> {
  let systemSecrets: Record<string, string> = {};
  let installationSecrets: Record<string, string> = {};

  try {
    const sys = await context.secrets.getSystem();
    if (sys) systemSecrets = sys;
  } catch {
    // fall through
  }
  try {
    const usr = await context.secrets.getInstallation();
    if (usr) installationSecrets = usr;
  } catch {
    // fall through
  }

  const apiKey = systemSecrets.TRELLO_API_KEY ?? installationSecrets.TRELLO_API_KEY;
  const token = installationSecrets.TRELLO_TOKEN;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new TrelloApiError('AUTH_INVALID', 401, 'Trello API key not configured.', {
      type: 'admin_action',
      description: 'Add your Trello API key in the system secrets (TRELLO_API_KEY).',
    });
  }
  if (!token || token.trim().length === 0) {
    throw new TrelloApiError('AUTH_INVALID', 401, 'Trello token not configured.', {
      type: 'user_action',
      description: 'Add your Trello token in the app settings (TRELLO_TOKEN).',
    });
  }

  return { apiKey: apiKey.trim(), token: token.trim() };
}

function buildUrl(
  endpoint: string,
  credentials: TrelloCredentials,
  query?: TrelloRequestOptions['query'],
): string {
  const url = new URL(`${TRELLO_API_BASE}${endpoint}`);
  url.searchParams.set('key', credentials.apiKey);
  url.searchParams.set('token', credentials.token);
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

export async function trelloRequest<T = unknown>(
  context: SecretsContext,
  endpoint: string,
  options: TrelloRequestOptions = {},
): Promise<T> {
  const credentials = await getCredentials(context);
  const method = options.method ?? 'GET';
  const url = buildUrl(endpoint, credentials, options.query);

  const headers: Record<string, string> = {
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

  const response = lastResponse as Response;
  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // keep raw text for the message
  }
  const classified = classifyTrelloError(response.status, parsed);
  throw new TrelloApiError(classified.code, response.status, classified.message, classified.action);
}
