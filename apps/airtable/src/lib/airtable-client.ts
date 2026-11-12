/**
 * Shared Airtable API client.
 *
 * - Auth via Bearer token (personal access token: pat...)
 * - POST/PATCH bodies use application/json
 * - Base URL: https://api.airtable.com/v0
 */

const AIRTABLE_API_URL = 'https://api.airtable.com/v0';

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
// Helper: get the API token from installation secrets
// ---------------------------------------------------------------------------

export async function getAirtableToken(ctx: {
  installationSecret: (key: string) => Promise<string | undefined>;
}): Promise<string> {
  const token = await ctx.installationSecret('API_TOKEN');
  if (!token) {
    throw new Error('[AUTH_REQUIRED] Missing API_TOKEN user secret.');
  }
  return token;
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export async function airtableRequest(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: { body?: unknown; params?: Record<string, string | string[]> },
  ctx: { installationSecret: (key: string) => Promise<string | undefined> },
): Promise<unknown> {
  const token = await getAirtableToken(ctx);

  let url = `${AIRTABLE_API_URL}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  if (options.params && Object.keys(options.params).length > 0) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          qs.append(key, v);
        }
      } else {
        qs.append(key, value);
      }
    }
    url += `?${qs.toString()}`;
  }

  if (options.body !== undefined) {
    init.headers = {
      ...init.headers,
      'Content-Type': 'application/json',
    };
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, init);
  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || response.statusText;
    throw new Error(`[AIRTABLE_ERROR] ${response.status}: ${message}`);
  }

  return data;
}
