/**
 * Calendly REST API client.
 *
 * Stateless: the access token is read from `ctx.secrets.getInstallation()` on every
 * call. Auth uses the `Authorization: Bearer <token>` header.
 *
 * Destination is the fixed host `api.calendly.com`, so a plain `fetch` is safe —
 * no SSRF surface, no `safeFetch` needed.
 */

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

const BASE_URL = 'https://api.calendly.com';

/**
 * Extract the Calendly personal access token from installation secrets.
 */
export async function getCalendlyToken(ctx: SecretsContext): Promise<string> {
  const installationSecrets = await ctx.secrets.getInstallation();
  const token = installationSecrets?.ACCESS_TOKEN;

  if (!token) {
    throw new Error(
      '[CALENDLY_ERROR] Calendly access token not configured. ' +
        'Add your personal access token in the app settings (Calendly → Integrations → Personal Access Tokens).',
    );
  }

  return token;
}

/**
 * Make an authenticated request to the Calendly REST API.
 *
 * - GET requests: `params` are serialized as query-string parameters.
 * - POST/PUT/PATCH/DELETE requests: `params` are serialized as a JSON body.
 */
export async function calendlyRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  params: Record<string, string | number | boolean | undefined> | undefined,
  ctx: SecretsContext,
): Promise<unknown> {
  const token = await getCalendlyToken(ctx);

  let url = `${BASE_URL}${path}`;
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
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    let errorMessage: string;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.message || errorJson.title || errorJson.error || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`[CALENDLY_ERROR] Calendly API error ${response.status}: ${errorMessage}`);
  }

  if (response.status === 204) return { success: true };

  return response.json();
}
