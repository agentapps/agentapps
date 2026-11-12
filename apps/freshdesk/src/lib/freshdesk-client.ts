/**
 * Freshdesk REST API client.
 *
 * Stateless: the API key and domain are read from `ctx.secrets.getInstallation()` on
 * every call. Auth uses HTTP Basic — API key as username, "X" as password.
 *
 * Base URL: https://{domain}.freshdesk.com/api/v2
 */

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

/**
 * Extract the Freshdesk credentials (API key + domain) from installation secrets.
 */
export async function getFreshdeskCredentials(
  ctx: SecretsContext,
): Promise<{ apiKey: string; domain: string }> {
  const installationSecrets = await ctx.secrets.getInstallation();
  const apiKey = installationSecrets?.API_KEY;
  const domain = installationSecrets?.DOMAIN;

  if (!apiKey) {
    throw new Error(
      '[FRESHDESK_ERROR] Freshdesk API key not configured. ' +
        'Add your API key in the app settings (Freshdesk → Profile Settings → Your API Key).',
    );
  }

  if (!domain) {
    throw new Error(
      '[FRESHDESK_ERROR] Freshdesk domain not configured. ' +
        'Add your subdomain (e.g. "mycompany" for mycompany.freshdesk.com) in the app settings.',
    );
  }

  return { apiKey, domain };
}

/**
 * Build the Basic auth header value for Freshdesk.
 *
 * Freshdesk uses the API key as the username and "X" as the password.
 */
function buildAuthHeader(apiKey: string): string {
  const encoded = Buffer.from(`${apiKey}:X`).toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Make an authenticated request to the Freshdesk REST API.
 *
 * - GET requests: `params` are serialized as query-string parameters.
 * - POST/PUT/DELETE requests: `params` are serialized as a JSON body.
 */
export async function freshdeskRequest<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  params: Record<string, unknown> | undefined,
  ctx: SecretsContext,
): Promise<T> {
  const { apiKey, domain } = await getFreshdeskCredentials(ctx);

  let url = `https://${domain}.freshdesk.com/api/v2${path}`;
  let body: string | undefined;

  if (params) {
    if (method === 'GET') {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    } else {
      body = JSON.stringify(params);
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: buildAuthHeader(apiKey),
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    let errorMessage: string;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.description || errorJson.message || errorJson.error || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`[FRESHDESK_ERROR] Freshdesk API error ${response.status}: ${errorMessage}`);
  }

  if (response.status === 204) return { success: true } as T;

  return response.json() as Promise<T>;
}
