/**
 * Shared Cloudflare API client.
 *
 * - Auth via Bearer token (Cloudflare API Token)
 * - Request/response bodies use JSON
 * - Responses have { success, result, errors, messages } envelope
 */

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';

// ---------------------------------------------------------------------------
// Helper: get the API token from installation secrets
// ---------------------------------------------------------------------------

export async function getCloudflareToken(ctx: {
  installationSecret: (key: string) => Promise<string | null>;
}): Promise<string> {
  const token = await ctx.installationSecret('API_TOKEN');
  if (!token) {
    throw new Error('[CLOUDFLARE_ERROR] Missing API_TOKEN user secret.');
  }
  return token;
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export async function cloudflareRequest(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: { params?: Record<string, unknown>; body?: Record<string, unknown> } | null,
  ctx: { installationSecret: (key: string) => Promise<string | null> },
): Promise<unknown> {
  const token = await getCloudflareToken(ctx);

  let url = `${CLOUDFLARE_API_URL}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  // Append query parameters for GET requests
  if (options?.params && Object.keys(options.params).length > 0) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        qs.set(key, String(value));
      }
    }
    url += `?${qs.toString()}`;
  }

  // Attach JSON body for non-GET requests
  if (options?.body && Object.keys(options.body).length > 0) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, init);
  const data = await response.json();

  if (!response.ok || data.success === false) {
    const errors = data?.errors as Array<{ message: string }> | undefined;
    const message = errors?.[0]?.message || response.statusText;
    throw new Error(`[CLOUDFLARE_ERROR] ${response.status}: ${message}`);
  }

  return data.result;
}
