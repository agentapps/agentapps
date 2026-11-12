/**
 * Shared Amplitude API client.
 *
 * - Auth via Basic auth with API_KEY:SECRET_KEY (base64)
 * - Export API: https://amplitude.com/api/2/
 * - Dashboard API: https://analytics.amplitude.com/api/3/
 * - JSON responses
 * - Credentials come from system secrets (API_KEY, SECRET_KEY)
 */

const AMPLITUDE_EXPORT_URL = 'https://amplitude.com/api/2';
const AMPLITUDE_DASHBOARD_URL = 'https://analytics.amplitude.com/api/3';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

export interface AmplitudeAuth {
  basicAuth: string;
}

export async function getAmplitudeAuth(ctx: {
  systemSecret: (key: string) => Promise<string | undefined>;
}): Promise<AmplitudeAuth> {
  const apiKey = await ctx.systemSecret('API_KEY');
  if (!apiKey) {
    throw new Error('[AMPLITUDE_ERROR] Missing API_KEY system secret.');
  }

  const secretKey = await ctx.systemSecret('SECRET_KEY');
  if (!secretKey) {
    throw new Error('[AMPLITUDE_ERROR] Missing SECRET_KEY system secret.');
  }

  const basicAuth = btoa(`${apiKey}:${secretKey}`);
  return { basicAuth };
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export async function amplitudeRequest(
  method: 'GET' | 'POST' | 'DELETE',
  baseUrl: typeof AMPLITUDE_EXPORT_URL | typeof AMPLITUDE_DASHBOARD_URL | string,
  path: string,
  params: Record<string, string | number | boolean | undefined | null> | null,
  ctx: {
    systemSecret: (key: string) => Promise<string | undefined>;
  },
  body?: Record<string, unknown>,
): Promise<unknown> {
  const { basicAuth } = await getAmplitudeAuth(ctx);

  const url = new URL(`${baseUrl}${path}`);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Basic ${basicAuth}`,
    Accept: 'application/json',
  };

  const fetchOptions: RequestInit = { method, headers };

  if (body) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), fetchOptions);

  const data = await response.json();

  if (!response.ok) {
    const message =
      (data as Record<string, unknown>)?.error ??
      (data as Record<string, unknown>)?.message ??
      response.statusText;
    throw new Error(`[AMPLITUDE_ERROR] ${response.status}: ${message}`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Re-export base URLs for convenience
// ---------------------------------------------------------------------------

export { AMPLITUDE_DASHBOARD_URL, AMPLITUDE_EXPORT_URL };
