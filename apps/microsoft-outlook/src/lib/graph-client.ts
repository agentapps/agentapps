/**
 * Microsoft Graph API client.
 *
 * Stateless: OAuth tokens are read from `ctx.secrets.getInstallation()` / `ctx.secrets.getSystem()`
 * on every call. Auth is Bearer token. Uses plain `fetch` with `AbortController`
 * for timeouts.
 */

import type { GraphError, OutlookSecrets } from './types.js';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

function getDisplayName(email?: string): string | undefined {
  if (!email) return undefined;
  const localPart = email.split('@')[0];
  return localPart
    .split(/[._-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Creates an authenticated Graph API client helper from secrets.
 * Handles token refresh via plain fetch + AbortController.
 */
export async function createGraphClient(ctx: SecretsContext) {
  const systemSecrets = (await ctx.secrets.getSystem()) ?? {};
  const installationSecrets = (await ctx.secrets.getInstallation()) ?? {};
  const secrets: OutlookSecrets = { ...systemSecrets, ...installationSecrets };

  const clientId = secrets.CLIENT_ID;
  const clientSecret = secrets.CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Microsoft OAuth credentials not configured. Missing CLIENT_ID or CLIENT_SECRET.',
    );
  }

  let accessToken = secrets.ACCESS_TOKEN;
  const refreshToken = secrets.REFRESH_TOKEN;
  const expiryDate = secrets.EXPIRY_DATE ? new Date(secrets.EXPIRY_DATE).getTime() : undefined;

  if (!accessToken || !refreshToken) {
    throw new Error('Outlook account not connected. Please connect your Microsoft account.');
  }

  // Refresh token if expired or about to expire (within 60s)
  const needsRefresh = !accessToken || (expiryDate && expiryDate < Date.now() + 60000);
  if (needsRefresh && refreshToken) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    try {
      const tokenResponse = await fetch(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        throw new Error(`Token refresh failed: ${errText}`);
      }

      const tokens = (await tokenResponse.json()) as Record<string, unknown>;
      accessToken = tokens.access_token as string;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to refresh token: ${message}`);
    }
  }

  // Resolve email: use stored secret or fetch from Graph API as fallback
  let email = secrets.EMAIL;
  if (!email) {
    try {
      const meResponse = await fetch(`${GRAPH_BASE_URL}/me?$select=mail,userPrincipalName`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (meResponse.ok) {
        const me = (await meResponse.json()) as Record<string, unknown>;
        email = (me.mail as string) || (me.userPrincipalName as string) || 'unknown@outlook.com';
      } else {
        email = 'unknown@outlook.com';
      }
    } catch {
      email = 'unknown@outlook.com';
    }
  }

  async function graphRequest(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<any> {
    const url = path.startsWith('http') ? path : `${GRAPH_BASE_URL}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    const options: RequestInit = { method, headers, signal: controller.signal };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      if (response.status === 204) return null;

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `Graph API error (${response.status}): ${errorBody}`;
        try {
          const parsed = JSON.parse(errorBody) as GraphError;
          if (parsed.error?.message) {
            errorMessage = `Graph API error: ${parsed.error.message} (${parsed.error.code})`;
          }
        } catch {}
        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return response.json();
      }

      return response.text();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  return { graphRequest, email, displayName: getDisplayName(email) };
}
