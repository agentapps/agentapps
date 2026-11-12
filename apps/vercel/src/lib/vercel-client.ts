/**
 * Shared Vercel API client.
 *
 * - Auth via Bearer token (personal access token)
 * - POST/PATCH bodies use application/json
 * - Base URL: https://api.vercel.com
 */

const VERCEL_API_URL = 'https://api.vercel.com';

// ---------------------------------------------------------------------------
// Helper: get the API token from installation secrets
// ---------------------------------------------------------------------------

export async function getVercelToken(ctx: {
  installationSecret: (key: string) => Promise<string | null>;
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

export async function vercelRequest(
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  path: string,
  options: { body?: Record<string, unknown>; params?: Record<string, unknown> } | null,
  ctx: { installationSecret: (key: string) => Promise<string | null> },
): Promise<unknown> {
  const token = await getVercelToken(ctx);

  let url = `${VERCEL_API_URL}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  if (options?.params && Object.keys(options.params).length > 0) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        qs.set(key, String(value));
      }
    }
    url += `?${qs.toString()}`;
  }

  if (options?.body && Object.keys(options.body).length > 0) {
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
    throw new Error(`[VERCEL_ERROR] ${response.status}: ${message}`);
  }

  return data;
}
