/**
 * ActiveCampaign API Client
 *
 * Authenticates per-user with BASE_URL + API_TOKEN (header `Api-Token`).
 * Replaces the MCA safeFetch/withTimeout with plain fetch + AbortController.
 */

import { ActiveCampaignError, ActiveCampaignRateLimitError, classifyAcError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 15_000;
const USER_AGENT = 'AgentApps-ActiveCampaign/2.0';
const MAX_GET_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 800;
const MAX_RETRY_DELAY_MS = 30_000;

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

export interface AcRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  searchParams?: Record<string, string | number | undefined>;
  body?: unknown;
  timeoutMs?: number;
}

interface AcCredentials {
  baseUrl: string;
  apiToken: string;
}

async function loadCredentials(context: SecretsContext): Promise<AcCredentials> {
  let installationSecrets: Record<string, string> = {};
  try {
    installationSecrets = (await context.secrets.getInstallation()) ?? {};
  } catch {
    installationSecrets = {};
  }
  const baseUrl = (installationSecrets.ACTIVECAMPAIGN_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const apiToken = (installationSecrets.ACTIVECAMPAIGN_API_TOKEN ?? '').trim();
  if (!baseUrl) {
    throw new ActiveCampaignError(
      'AUTH_INVALID',
      0,
      'ACTIVECAMPAIGN_BASE_URL not configured (e.g. https://youraccount.api-us1.com)',
    );
  }
  if (!apiToken) {
    throw new ActiveCampaignError('AUTH_INVALID', 0, 'ACTIVECAMPAIGN_API_TOKEN not configured');
  }
  if (/\s/.test(apiToken)) {
    throw new ActiveCampaignError(
      'AUTH_INVALID',
      0,
      'ACTIVECAMPAIGN_API_TOKEN contains invalid whitespace characters',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ActiveCampaignError(
      'AUTH_INVALID',
      0,
      'ACTIVECAMPAIGN_BASE_URL is not a valid URL (e.g. https://youraccount.api-us1.com)',
    );
  }
  if (parsed.protocol !== 'https:') {
    throw new ActiveCampaignError(
      'AUTH_INVALID',
      0,
      'ACTIVECAMPAIGN_BASE_URL must use https (e.g. https://youraccount.api-us1.com)',
    );
  }
  return { baseUrl, apiToken };
}

function buildUrl(
  baseUrl: string,
  path: string,
  searchParams?: AcRequestOptions['searchParams'],
): string {
  const trimmedPath = path.startsWith('/') ? path : `/${path}`;
  const fullPath = trimmedPath.startsWith('/api/') ? trimmedPath : `/api/3${trimmedPath}`;
  const url = new URL(fullPath, baseUrl);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  const text = await response.text().catch(() => '');
  return text || null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function rawRequest(
  credentials: AcCredentials,
  path: string,
  options: AcRequestOptions,
): Promise<unknown> {
  const { method = 'GET', searchParams, body, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const url = buildUrl(credentials.baseUrl, path, searchParams);

  const headers: Record<string, string> = {
    'Api-Token': credentials.apiToken,
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
  };
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetchWithTimeout(
    url,
    {
      method,
      headers,
      body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
    },
    timeoutMs,
  );

  if (!response.ok) {
    const errorBody = await parseResponseBody(response);
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterSeconds = retryAfter ? Number(retryAfter) : null;
      throw new ActiveCampaignRateLimitError(
        'Rate limited by ActiveCampaign API',
        retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
      );
    }
    throw classifyAcError(response.status, errorBody);
  }

  return parseResponseBody(response);
}

/** Retryable transient failures for idempotent GETs only. */
function isRetryableGetError(err: unknown): boolean {
  if (err instanceof ActiveCampaignRateLimitError) return true;
  if (err instanceof ActiveCampaignError) return err.status >= 500;
  const msg = err instanceof Error ? err.message : '';
  return /ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|timed out/i.test(msg);
}

/** Honour the server's `Retry-After` on 429 (clamped to 30s); otherwise back off
 *  exponentially from the base delay. */
function retryDelayMs(err: unknown, attempt: number): number {
  if (
    err instanceof ActiveCampaignRateLimitError &&
    err.retryAfterSeconds !== null &&
    err.retryAfterSeconds > 0
  ) {
    return Math.min(err.retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS);
  }
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

export async function acRequest(
  context: SecretsContext,
  path: string,
  options: AcRequestOptions = {},
): Promise<unknown> {
  const credentials = await loadCredentials(context);
  const method = options.method ?? 'GET';

  // Mutations: no retry — POST/PUT/DELETE without idempotency keys could duplicate.
  if (method !== 'GET') {
    return rawRequest(credentials, path, options);
  }

  // Idempotent GETs: retry transient failures with backoff, honouring Retry-After.
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_GET_RETRIES; attempt++) {
    try {
      return await rawRequest(credentials, path, options);
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_GET_RETRIES || !isRetryableGetError(err)) throw err;
      await new Promise((r) => setTimeout(r, retryDelayMs(err, attempt)));
    }
  }
  throw lastErr;
}

export async function acPing(context: SecretsContext): Promise<void> {
  // Lightweight probe used by health-check.
  await acRequest(context, '/users/me', { timeoutMs: 8_000 });
}
