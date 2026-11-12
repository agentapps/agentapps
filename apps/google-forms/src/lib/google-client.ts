/**
 * Google API Client Manager
 *
 * Manages OAuth2 authentication and Google API clients for Forms and Drive.
 * Secrets are accessed via `ctx.secrets.getSystem()` / `ctx.secrets.getInstallation()`
 * from the Agent Apps SDK.
 */

import type { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

// =============================================================================
// TYPES
// =============================================================================

export interface GoogleClients {
  oauth2Client: OAuth2Client;
  forms: ReturnType<typeof google.forms>;
  drive: ReturnType<typeof google.drive>;
}

/** Minimal context shape needed by the Google client (secrets access). */
export interface GoogleSecretsContext {
  secrets: {
    getSystem(): Promise<Record<string, string> | null>;
    getInstallation(): Promise<Record<string, string> | null>;
  };
  auth: {
    refresh(): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string }>;
  };
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
export async function initializeGoogleClients(ctx: GoogleSecretsContext): Promise<GoogleClients> {
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
  const redirectUrisRaw = systemSecrets.REDIRECT_URI || systemSecrets.redirect_uris;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Google Forms OAuth credentials not found.\n' +
        'Expected: CLIENT_ID, CLIENT_SECRET in system secrets.\n' +
        'Please configure OAuth credentials for this app.',
    );
  }

  // Parse redirect URI
  // Placeholder callback — the station overrides it with its own reachable
  // domain via the REDIRECT_URI system secret ({publicUrl}/auth/callback).
  let redirectUri = 'https://your-station.example.com/auth/callback';
  if (redirectUrisRaw) {
    try {
      const uris = JSON.parse(redirectUrisRaw);
      redirectUri = Array.isArray(uris) ? uris[0] : redirectUrisRaw;
    } catch {
      redirectUri = redirectUrisRaw;
    }
  }

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

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
    forms: google.forms({ version: 'v1', auth: oauth2Client }),
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
export async function ensureAuthenticated(ctx: GoogleSecretsContext): Promise<void> {
  const clients = await initializeGoogleClients(ctx);
  const { oauth2Client } = clients;

  try {
    // Check if current token is valid
    await oauth2Client.getTokenInfo(oauth2Client.credentials.access_token || '');
  } catch {
    // Token is invalid, try to refresh via the host
    try {
      const refreshed = await ctx.auth.refresh();
      oauth2Client.setCredentials({
        access_token: refreshed.accessToken,
        refresh_token: refreshed.refreshToken ?? oauth2Client.credentials.refresh_token,
      });
    } catch {
      throw new Error('Authentication expired. Please re-authorize the app.');
    }
  }
}

/**
 * Wrapper that handles 401 errors by attempting token refresh.
 */
export async function withAuthRetry<T>(
  ctx: GoogleSecretsContext,
  operation: () => Promise<T>,
  _operationName: string,
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    // Check if it's a 401 error
    const is401 =
      error?.code === 401 ||
      error?.status === 401 ||
      error?.response?.status === 401 ||
      error?.message?.includes('401') ||
      error?.message?.toLowerCase().includes('invalid credentials') ||
      error?.message?.toLowerCase().includes('token has been expired');

    if (!is401) {
      throw error;
    }

    // Try to refresh and retry
    await ensureAuthenticated(ctx);
    return await operation();
  }
}
