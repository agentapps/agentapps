/**
 * Google API Client Manager
 *
 * Manages OAuth2 authentication and Google API clients for Drive.
 * Secrets are fetched via `ctx.secrets.getSystem()` / `ctx.secrets.getInstallation()`
 * (Agent Apps SDK).
 */

import type { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

// =============================================================================
// TYPES
// =============================================================================

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

export interface GoogleClients {
  oauth2Client: OAuth2Client;
  drive: ReturnType<typeof google.drive>;
}

// =============================================================================
// SINGLETON CLIENT MANAGER
// =============================================================================

let googleClients: GoogleClients | null = null;
let cachedSystemSecrets: Record<string, string> | null = null;
let cachedUserSecrets: Record<string, string> | null = null;

/**
 * Initialize Google clients with credentials from context.
 */
export async function initializeGoogleClients(ctx: SecretsContext): Promise<GoogleClients> {
  const systemSecrets = (await ctx.secrets.getSystem()) ?? {};
  const installationSecrets = (await ctx.secrets.getInstallation()) ?? {};

  // Check if we need to reinitialize (secrets changed)
  const secretsChanged =
    JSON.stringify(systemSecrets) !== JSON.stringify(cachedSystemSecrets) ||
    JSON.stringify(installationSecrets) !== JSON.stringify(cachedUserSecrets);

  if (googleClients && !secretsChanged) {
    return googleClients;
  }

  // Cache secrets
  cachedSystemSecrets = systemSecrets;
  cachedUserSecrets = installationSecrets;

  // Load credentials
  const clientId = systemSecrets.CLIENT_ID || systemSecrets.client_id;
  const clientSecret = systemSecrets.CLIENT_SECRET || systemSecrets.client_secret;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Google Drive OAuth credentials not found.\n' +
        'Expected: CLIENT_ID, CLIENT_SECRET in system secrets.\n' +
        'Please configure OAuth credentials for this app.',
    );
  }

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);

  // Set user credentials if available
  if (installationSecrets.ACCESS_TOKEN) {
    oauth2Client.setCredentials({
      access_token: installationSecrets.ACCESS_TOKEN,
      refresh_token: installationSecrets.REFRESH_TOKEN,
      expiry_date: installationSecrets.EXPIRY_DATE
        ? parseInt(installationSecrets.EXPIRY_DATE, 10)
        : undefined,
    });
  }

  // Create API clients
  googleClients = {
    oauth2Client,
    drive: google.drive({ version: 'v3', auth: oauth2Client }),
  };

  return googleClients;
}

/**
 * Get initialized Google clients (returns null if not initialized).
 */
export function getGoogleClients(): GoogleClients | null {
  return googleClients;
}

/**
 * Ensure user is authenticated, refresh token if needed.
 */
export async function ensureAuthenticated(ctx: SecretsContext): Promise<void> {
  const clients = await initializeGoogleClients(ctx);
  const { oauth2Client } = clients;

  try {
    await oauth2Client.getTokenInfo(oauth2Client.credentials.access_token || '');
  } catch {
    if (oauth2Client.credentials.refresh_token) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
      } catch {
        throw new Error('Authentication expired. Please re-authorize the app.');
      }
    } else {
      throw new Error('Not authenticated. Please authorize the app first.');
    }
  }
}

/**
 * Wrapper that handles 401 errors by attempting token refresh.
 */
export async function withAuthRetry<T>(
  ctx: SecretsContext,
  operation: () => Promise<T>,
  operationName: string,
): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    const err = error as {
      code?: number;
      status?: number;
      response?: { status?: number };
      message?: string;
    };
    const is401 =
      err?.code === 401 ||
      err?.status === 401 ||
      err?.response?.status === 401 ||
      err?.message?.includes('401') ||
      err?.message?.toLowerCase().includes('invalid credentials') ||
      err?.message?.toLowerCase().includes('token has been expired');

    if (!is401) {
      throw error;
    }

    console.error(`[GoogleClient] 401 error in ${operationName}, attempting token refresh...`);

    await ensureAuthenticated(ctx);
    return await operation();
  }
}
