/**
 * Shared Holded API client.
 *
 * - Auth via `key` query parameter
 * - Base URL: https://api.holded.com/api
 * - JSON request/response bodies
 */

const HOLDED_API_URL = 'https://api.holded.com/api';

// ---------------------------------------------------------------------------
// Context interface (matches AgentApp handler context)
// ---------------------------------------------------------------------------

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

// ---------------------------------------------------------------------------
// Helper: get the API key from system secrets
// ---------------------------------------------------------------------------

export async function getHoldedKey(ctx: {
  systemSecret: (key: string) => Promise<string | null>;
}): Promise<string> {
  const apiKey = await ctx.systemSecret('API_KEY');
  if (!apiKey) {
    throw new Error('[HOLDED_ERROR] Missing API_KEY system secret.');
  }
  return apiKey;
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export async function holdedRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: Record<string, unknown> | null,
  ctx: { systemSecret: (key: string) => Promise<string | null> },
): Promise<unknown> {
  const apiKey = await getHoldedKey(ctx);

  const separator = path.includes('?') ? '&' : '?';
  const url = `${HOLDED_API_URL}/${path}${separator}key=${apiKey}`;

  const init: RequestInit = {
    method,
    headers: {
      Accept: 'application/json',
    },
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const data = await response.json();

  if (!response.ok) {
    const message = data?.message || data?.error || response.statusText;
    throw new Error(`[HOLDED_ERROR] ${response.status}: ${message}`);
  }

  return data;
}
