/**
 * Shared Mixpanel API client.
 *
 * - Auth via Basic auth with SERVICE_ACCOUNT_USERNAME:SERVICE_ACCOUNT_SECRET (base64)
 * - Query API: https://mixpanel.com/api/query
 * - Data Export API: https://data.mixpanel.com/api/2.0
 * - project_id passed as a query parameter
 * - Credentials come from system secrets (PROJECT_ID) and installation secrets
 *   (SERVICE_ACCOUNT_USERNAME, SERVICE_ACCOUNT_SECRET)
 */

const MIXPANEL_QUERY_URL = 'https://mixpanel.com/api/query';
const MIXPANEL_EXPORT_URL = 'https://data.mixpanel.com/api/2.0';

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

export interface MixpanelAuth {
  projectId: string;
  basicAuth: string;
}

export async function getMixpanelAuth(ctx: {
  systemSecret: (key: string) => Promise<string | undefined>;
  installationSecret: (key: string) => Promise<string | undefined>;
}): Promise<MixpanelAuth> {
  const projectId = await ctx.systemSecret('PROJECT_ID');
  if (!projectId) {
    throw new Error('[MIXPANEL_ERROR] Missing PROJECT_ID system secret.');
  }

  const username = await ctx.installationSecret('SERVICE_ACCOUNT_USERNAME');
  if (!username) {
    throw new Error('[MIXPANEL_ERROR] Missing SERVICE_ACCOUNT_USERNAME user secret.');
  }

  const secret = await ctx.installationSecret('SERVICE_ACCOUNT_SECRET');
  if (!secret) {
    throw new Error('[MIXPANEL_ERROR] Missing SERVICE_ACCOUNT_SECRET user secret.');
  }

  const basicAuth = btoa(`${username}:${secret}`);
  return { projectId, basicAuth };
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export async function mixpanelRequest(
  method: 'GET' | 'POST',
  baseUrl: typeof MIXPANEL_QUERY_URL | typeof MIXPANEL_EXPORT_URL | string,
  path: string,
  params: Record<string, string | number | boolean | undefined | null> | null,
  ctx: {
    systemSecret: (key: string) => Promise<string | undefined>;
    installationSecret: (key: string) => Promise<string | undefined>;
  },
): Promise<unknown> {
  const { projectId, basicAuth } = await getMixpanelAuth(ctx);

  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set('project_id', projectId);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: 'application/json',
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      (data as Record<string, unknown>)?.error ??
      (data as Record<string, unknown>)?.message ??
      response.statusText;
    throw new Error(`[MIXPANEL_ERROR] ${response.status}: ${message}`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Re-export base URLs for convenience
// ---------------------------------------------------------------------------

export { MIXPANEL_EXPORT_URL, MIXPANEL_QUERY_URL };
