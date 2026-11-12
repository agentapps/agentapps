/**
 * Shared Datadog API client.
 *
 * - Auth via DD-API-KEY + DD-APPLICATION-KEY headers
 * - All request/response bodies are JSON
 * - Credentials come from installation secrets (API_KEY, APP_KEY)
 */

const DATADOG_API_URL = 'https://api.datadoghq.com';

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
// Helper: get Datadog config from installation secrets
// ---------------------------------------------------------------------------

export interface DatadogConfig {
  apiKey: string;
  appKey: string;
}

export async function getDatadogConfig(ctx: {
  installationSecret: (key: string) => Promise<string | undefined>;
}): Promise<DatadogConfig> {
  const apiKey = await ctx.installationSecret('API_KEY');
  if (!apiKey) {
    throw new Error('[DATADOG_ERROR] Missing API_KEY user secret.');
  }
  const appKey = await ctx.installationSecret('APP_KEY');
  if (!appKey) {
    throw new Error('[DATADOG_ERROR] Missing APP_KEY user secret.');
  }
  return { apiKey, appKey };
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export interface DatadogRequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}

export async function datadogRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: DatadogRequestOptions | null,
  ctx: { installationSecret: (key: string) => Promise<string | undefined> },
): Promise<unknown> {
  const { apiKey, appKey } = await getDatadogConfig(ctx);

  let url = `${DATADOG_API_URL}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      'DD-API-KEY': apiKey,
      'DD-APPLICATION-KEY': appKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  if (options?.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, init);
  const data = await response.json();

  if (!response.ok) {
    const message =
      (data as Record<string, unknown>)?.errors?.[0] ??
      (data as Record<string, unknown>)?.message ??
      response.statusText;
    throw new Error(`[DATADOG_ERROR] ${response.status}: ${message}`);
  }

  return data;
}
