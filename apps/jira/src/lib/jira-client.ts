/**
 * Shared Jira Cloud REST API client.
 *
 * - Auth via HTTP Basic Auth (email:api_token encoded as base64)
 * - All requests use JSON bodies (application/json)
 * - Credentials are read from installation secrets on every call
 */

// ---------------------------------------------------------------------------
// Context interface (matches AgentApp handler context)
// ---------------------------------------------------------------------------

export interface JiraContext {
  installationSecret: (key: string) => Promise<string | undefined>;
}

// ---------------------------------------------------------------------------
// Config helper
// ---------------------------------------------------------------------------

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export async function getJiraConfig(ctx: JiraContext): Promise<JiraConfig> {
  const [baseUrl, email, apiToken] = await Promise.all([
    ctx.installationSecret('JIRA_URL'),
    ctx.installationSecret('JIRA_EMAIL'),
    ctx.installationSecret('JIRA_API_TOKEN'),
  ]);

  if (!baseUrl || !email || !apiToken) {
    const missing: string[] = [];
    if (!baseUrl) missing.push('JIRA_URL');
    if (!email) missing.push('JIRA_EMAIL');
    if (!apiToken) missing.push('JIRA_API_TOKEN');
    throw new Error(
      `[AUTH_REQUIRED] Missing installation secrets: ${missing.join(', ')}. ` +
        'Configure your Jira Cloud URL, email, and API token.',
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    email,
    apiToken,
  };
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export interface JiraRequestOptions {
  body?: unknown;
  params?: Record<string, string | number | undefined>;
  /** Override the base API path (default: '/rest/api/3'). Use '/rest/agile/1.0' for Agile APIs. */
  basePath?: string;
}

export async function jiraRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: JiraRequestOptions | null,
  ctx: JiraContext,
): Promise<unknown> {
  const config = await getJiraConfig(ctx);

  const basePath = options?.basePath ?? '/rest/api/3';
  let url = `${config.baseUrl}${basePath}${path}`;

  if (options?.params) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        qs.set(key, String(value));
      }
    }
    const queryString = qs.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const credentials = btoa(`${config.email}:${config.apiToken}`);

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  };

  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, init);

  // Handle 204 No Content (e.g. successful PUT with no response body)
  if (response.status === 204) {
    return { success: true };
  }

  const data = await response.json();

  if (!response.ok) {
    const messages: string[] = [];
    if (data?.errorMessages?.length) {
      messages.push(...data.errorMessages);
    }
    if (data?.errors && typeof data.errors === 'object') {
      for (const [field, msg] of Object.entries(data.errors)) {
        messages.push(`${field}: ${msg}`);
      }
    }
    const message = messages.length > 0 ? messages.join('; ') : response.statusText;
    throw new Error(`[JIRA_ERROR] ${response.status}: ${message}`);
  }

  return data;
}
