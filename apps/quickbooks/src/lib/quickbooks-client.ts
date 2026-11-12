/**
 * Shared QuickBooks Online API client.
 *
 * - Auth via OAuth2 Bearer token
 * - POST bodies use application/json
 * - All requests include ?minorversion=73
 * - Base URL: https://quickbooks.api.intuit.com/v3/company/{realmId}/
 */

const QUICKBOOKS_API_URL = 'https://quickbooks.api.intuit.com/v3/company';

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
// Helper: get OAuth2 credentials from installation secrets
// ---------------------------------------------------------------------------

export async function getQuickBooksAuth(ctx: {
  systemSecret: (key: string) => Promise<string | null>;
  installationSecret: (key: string) => Promise<string | null>;
}): Promise<{ accessToken: string; realmId: string }> {
  const accessToken = await ctx.installationSecret('ACCESS_TOKEN');
  const realmId = await ctx.installationSecret('REALM_ID');
  if (!accessToken) {
    throw new Error('[QUICKBOOKS_ERROR] Missing ACCESS_TOKEN user secret.');
  }
  if (!realmId) {
    throw new Error('[QUICKBOOKS_ERROR] Missing REALM_ID user secret.');
  }
  return { accessToken, realmId };
}

// ---------------------------------------------------------------------------
// Main request function
// ---------------------------------------------------------------------------

export async function quickbooksRequest(
  method: 'GET' | 'POST',
  path: string,
  body: Record<string, unknown> | null,
  ctx: {
    systemSecret: (key: string) => Promise<string | null>;
    installationSecret: (key: string) => Promise<string | null>;
  },
): Promise<unknown> {
  const { accessToken, realmId } = await getQuickBooksAuth(ctx);

  const separator = path.includes('?') ? '&' : '?';
  const url = `${QUICKBOOKS_API_URL}/${realmId}/${path}${separator}minorversion=73`;

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  };

  if (body && method === 'POST') {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const data = await response.json();

  if (!response.ok) {
    const message = data?.Fault?.Error?.[0]?.Message || response.statusText;
    throw new Error(`[QUICKBOOKS_ERROR] ${response.status}: ${message}`);
  }

  return data;
}
