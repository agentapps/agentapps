/**
 * Canva Connect API Client
 *
 * Stateless: secrets read from `context` every call. On 401 the access token
 * is refreshed and persisted to the backend via `context.updateInstallationSecrets`,
 * so subsequent requests (in this or any other worker) see the fresh token.
 */

import { CanvaApiError, classifyCanvaApiError } from './_canva-error.js';

const CANVA_API_BASE = 'https://api.canva.com/rest/v1';

export interface CanvaRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

export interface CanvaSecrets {
  CLIENT_ID?: string;
  CLIENT_SECRET?: string;
  ACCESS_TOKEN?: string;
  REFRESH_TOKEN?: string;
}

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

interface Credentials {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
}

export async function loadCanvaSecrets(context: SecretsContext): Promise<CanvaSecrets> {
  const [systemSecrets, installationSecrets] = await Promise.all([
    context.secrets.getSystem(),
    context.secrets.getInstallation(),
  ]);
  return { ...systemSecrets, ...installationSecrets } as CanvaSecrets;
}

async function readCredentials(context: SecretsContext): Promise<Credentials> {
  const secrets = await loadCanvaSecrets(context);
  const clientId = secrets.CLIENT_ID;
  const clientSecret = secrets.CLIENT_SECRET;
  const accessToken = secrets.ACCESS_TOKEN;
  const refreshToken = secrets.REFRESH_TOKEN;

  if (!clientId || !clientSecret) {
    throw new Error('Canva system secrets missing: CLIENT_ID and CLIENT_SECRET required.');
  }
  if (!accessToken || !refreshToken) {
    throw new Error('Canva authentication required. Please connect your Canva account.');
  }

  return { clientId, clientSecret, accessToken, refreshToken };
}

async function refreshAccessToken(creds: Credentials): Promise<string> {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const response = await fetch(`${CANVA_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Canva token: ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string; refresh_token?: string };
  return data.access_token;
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [800, 2000, 5000];

function jitter(ms: number): number {
  return ms + Math.floor(Math.random() * 400);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function canvaRequest<T = unknown>(
  context: SecretsContext,
  endpoint: string,
  options: CanvaRequestOptions = {},
): Promise<T> {
  const creds = await readCredentials(context);
  const method = options.method || 'GET';

  const fetchWith = async (token: string): Promise<Response> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };
    if (options.body !== undefined && !options.headers?.['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(`${CANVA_API_BASE}${endpoint}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let activeToken = creds.accessToken;
  let attempt = 0;

  while (true) {
    let response = await fetchWith(activeToken);

    if (response.status === 401 && attempt === 0) {
      activeToken = await refreshAccessToken(creds);
      response = await fetchWith(activeToken);
    }

    if (response.ok) {
      if (response.status === 204) return {} as T;
      return (await response.json()) as T;
    }

    const shouldRetry =
      method === 'GET' && attempt < MAX_RETRIES && RETRY_STATUSES.has(response.status);

    if (!shouldRetry) {
      const errorText = await response.text();
      let parsed: unknown = errorText;
      try {
        parsed = JSON.parse(errorText);
      } catch {
        // not JSON; keep raw text for the message
      }
      const classified = classifyCanvaApiError(
        response.status,
        parsed,
        errorText || 'Canva API error',
      );
      throw new CanvaApiError(response.status, classified);
    }

    const retryAfterHeader = response.headers.get('retry-after');
    const retryAfterMs = retryAfterHeader
      ? Math.min(30_000, Number.parseInt(retryAfterHeader, 10) * 1000)
      : (RETRY_DELAYS_MS[attempt] ?? 5000);
    await sleep(jitter(retryAfterMs));
    attempt++;
  }
}
