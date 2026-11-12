/**
 * Zapier NLA (Natural Language Actions) API Client.
 *
 * - Auth: Bearer API key from installation secrets
 * - Base URL: https://nla.zapier.com/api/v1
 * - All request/response bodies are JSON
 * - Error prefix: [ZAPIER_ERROR]
 */

const ZAPIER_NLA_BASE_URL = 'https://nla.zapier.com/api/v1';

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
// Helper: get Zapier API key from installation secrets
// ---------------------------------------------------------------------------

export async function getZapierApiKey(ctx: {
  installationSecret: (key: string) => Promise<string | undefined>;
}): Promise<string> {
  const apiKey = await ctx.installationSecret('API_KEY');
  if (!apiKey) {
    throw new Error('[ZAPIER_ERROR] Missing API_KEY user secret.');
  }
  return apiKey;
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export interface ZapierRequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}

export async function zapierRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: ZapierRequestOptions | null,
  ctx: { installationSecret: (key: string) => Promise<string | undefined> },
): Promise<unknown> {
  const apiKey = await getZapierApiKey(ctx);

  let url = `${ZAPIER_NLA_BASE_URL}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
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

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message =
      (data as Record<string, unknown>)?.error ??
      (data as Record<string, unknown>)?.message ??
      response.statusText;
    throw new Error(`[ZAPIER_ERROR] ${response.status}: ${message}`);
  }

  return await response.json();
}
