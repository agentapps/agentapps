/**
 * Gmail API client factory.
 *
 * Creates an authenticated Gmail API client from secrets obtained via the
 * AgentApps SDK context. The backend owns the refresh_token and serves a
 * fresh access_token — we never auto-refresh here (avoids the double-owner
 * anti-pattern that invalidates Google's refresh_token on rotation).
 */

import { google } from 'googleapis';

export interface GmailSecrets {
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

export function getDisplayName(email?: string): string | undefined {
  if (!email) return undefined;
  const localPart = email.split('@')[0];
  return localPart
    .split(/[._-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export async function getSecrets(ctx: SecretsContext): Promise<GmailSecrets> {
  const systemSecrets = (await ctx.secrets.getSystem()) ?? {};
  let installationSecrets: Record<string, string> = {};
  try {
    installationSecrets = (await ctx.secrets.getInstallation()) ?? {};
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!/no user credentials configured/i.test(message)) throw error;
  }
  return { ...systemSecrets, ...installationSecrets } as GmailSecrets;
}

export async function createGmailClient(secrets: GmailSecrets) {
  const clientId = secrets.CLIENT_ID;
  const clientSecret = secrets.CLIENT_SECRET;
  const redirectUri = secrets.REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Gmail OAuth credentials not configured. Missing CLIENT_ID, CLIENT_SECRET, or REDIRECT_URI.',
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const accessToken = secrets.ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('Gmail account not connected. Please connect your Google account.');
  }

  oauth2Client.setCredentials({ access_token: accessToken });

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
    email: secrets.EMAIL || 'unknown@gmail.com',
    displayName: getDisplayName(secrets.EMAIL),
  };
}
