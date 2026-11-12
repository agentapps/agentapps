/**
 * Google Analytics client factory.
 *
 * Creates authenticated googleapis clients from secrets obtained via the
 * Agent Apps SDK context. Secrets are fetched on-demand per call.
 */

import { google } from 'googleapis';

export interface AnalyticsSecrets {
  CLIENT_ID?: string;
  CLIENT_SECRET?: string;
  REDIRECT_URI?: string;
  ACCESS_TOKEN?: string;
  REFRESH_TOKEN?: string;
  EMAIL?: string;
  EXPIRY_DATE?: string;
}

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

export async function getAnalyticsSecrets(ctx: SecretsContext): Promise<AnalyticsSecrets> {
  const systemSecrets = await ctx.secrets.getSystem();
  const installationSecrets = await ctx.secrets.getInstallation();
  return {
    ...(systemSecrets ?? {}),
    ...(installationSecrets ?? {}),
  } as AnalyticsSecrets;
}

export async function createAnalyticsClients(secrets: AnalyticsSecrets) {
  const clientId = secrets.CLIENT_ID;
  const clientSecret = secrets.CLIENT_SECRET;
  const redirectUrisRaw = secrets.REDIRECT_URI;

  if (!clientId || !clientSecret) {
    throw new Error(
      '[SYSTEM_CONFIG_MISSING] Google OAuth credentials not configured. Missing CLIENT_ID or CLIENT_SECRET.',
    );
  }

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

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const accessToken = secrets.ACCESS_TOKEN;
  const refreshToken = secrets.REFRESH_TOKEN;
  const expiryDate = secrets.EXPIRY_DATE ? Number.parseInt(secrets.EXPIRY_DATE, 10) : undefined;

  if (!accessToken || !refreshToken) {
    throw new Error(
      '[AUTH_REQUIRED] Google account not connected. Please connect your Google account.',
    );
  }

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiryDate,
  });

  const needsRefresh = !accessToken || (expiryDate && expiryDate < Date.now() + 60_000);
  if (needsRefresh && refreshToken) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
    } catch (error: any) {
      throw new Error(`[AUTH_EXPIRED] Failed to refresh token: ${error.message}`);
    }
  }

  return {
    data: google.analyticsdata({ version: 'v1beta', auth: oauth2Client }),
    admin: google.analyticsadmin({ version: 'v1beta', auth: oauth2Client }),
    email: secrets.EMAIL || 'unknown@gmail.com',
  };
}
