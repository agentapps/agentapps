/**
 * SendGrid API client.
 *
 * Auth: Bearer token (API key from system secrets).
 * Base URL: https://api.sendgrid.com/v3
 * All requests/responses are JSON.
 * Error prefix: [SENDGRID_ERROR]
 */

const SENDGRID_API_BASE = 'https://api.sendgrid.com/v3';

// ---------------------------------------------------------------------------
// Context interface (matches AgentApp handler context)
// ---------------------------------------------------------------------------

export interface SecretsContext {
  systemSecret: (key: string) => Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Helper: get the API key from system secrets
// ---------------------------------------------------------------------------

export async function getSendGridKey(ctx: SecretsContext): Promise<string> {
  const apiKey = await ctx.systemSecret('API_KEY');
  if (!apiKey) {
    throw new Error(
      '[SENDGRID_ERROR] Missing API_KEY system secret. ' +
        'Configure it with your SendGrid API key (Settings → API Keys).',
    );
  }
  return apiKey;
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export async function sendgridRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown | null,
  ctx: SecretsContext,
): Promise<unknown> {
  const apiKey = await getSendGridKey(ctx);

  const url = `${SENDGRID_API_BASE}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };

  const init: RequestInit = { method, headers };

  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);

  // 202 Accepted (send-email), 204 No Content — return empty
  if (response.status === 202 || response.status === 204) {
    return {};
  }

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    const msg =
      typeof data === 'object' && data !== null
        ? JSON.stringify((data as Record<string, unknown>).errors ?? data)
        : String(data);
    throw new Error(`[SENDGRID_ERROR] ${response.status}: ${msg}`);
  }

  return data;
}
