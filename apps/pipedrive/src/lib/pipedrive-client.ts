/**
 * Pipedrive API client.
 *
 * - Auth via `api_token` query parameter appended to every request URL
 * - Base URL: https://api.pipedrive.com/v1
 * - JSON request/response bodies
 * - Error prefix: [PIPEDRIVE_ERROR]
 */

const BASE_URL = 'https://api.pipedrive.com/v1';

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
// Helper: get API token from installation secrets
// ---------------------------------------------------------------------------

export async function getApiToken(ctx: {
  installationSecret: (key: string) => Promise<string | undefined>;
}): Promise<string> {
  const token = await ctx.installationSecret('API_TOKEN');
  if (!token) {
    throw new Error(
      '[PIPEDRIVE_ERROR] Missing API_TOKEN user secret. Provide your Pipedrive API token.',
    );
  }
  return token;
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export async function pipedriveRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: {
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
  },
  ctx: { installationSecret: (key: string) => Promise<string | undefined> },
): Promise<unknown> {
  const apiToken = await getApiToken(ctx);

  // Build URL with api_token as query parameter
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('api_token', apiToken);

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const init: RequestInit = { method };

  if (options.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url.toString(), init);
  const data = await response.json();

  if (!response.ok) {
    const message =
      (data as Record<string, unknown>)?.error ??
      (data as Record<string, unknown>)?.error_info ??
      response.statusText;
    throw new Error(`[PIPEDRIVE_ERROR] ${response.status}: ${message}`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Validate credentials
// ---------------------------------------------------------------------------

/**
 * Validate Pipedrive credentials by fetching the current user.
 */
export async function validateCredentials(ctx: {
  installationSecret: (key: string) => Promise<string | undefined>;
}): Promise<void> {
  await pipedriveRequest('GET', '/users/me', {}, ctx);
}
