import { createApp } from '@agentapps/sdk';
import { initializeGoogleClients } from './lib/index.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.google.sheets',
  version: '2.0.2',
  name: 'Google Sheets',
  description:
    'Create, read, write, append, clear, format, and export Google Sheets spreadsheets - create spreadsheets, get metadata, add/delete/copy sheet tabs, write data, append rows, batch update values and formatting (formulas, conditional formatting), clear ranges, read data, list tabs, export to CSV/XLSX/PDF. To delete a spreadsheet, use the Google Drive app.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'google',
  keywords: [
    'google',
    'sheets',
    'spreadsheet',
    'data',
    'export',
    'write',
    'create',
    'format',
    'formulas',
  ],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    pkce: false,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN'],
  },
});

app.health(async (ctx) => {
  const systemSecrets = (await ctx.secrets.getSystem()) ?? {};
  const installationSecrets = (await ctx.secrets.getInstallation()) ?? {};

  if (!systemSecrets.CLIENT_ID) {
    throw new Error(
      '[SYSTEM_CONFIG_MISSING] Google OAuth Client ID not configured. Configure CLIENT_ID in system secrets.',
    );
  }
  if (!systemSecrets.CLIENT_SECRET) {
    throw new Error(
      '[SYSTEM_CONFIG_MISSING] Google OAuth Client Secret not configured. Configure CLIENT_SECRET in system secrets.',
    );
  }

  if (!installationSecrets.ACCESS_TOKEN || !installationSecrets.REFRESH_TOKEN) {
    throw new Error(
      '[AUTH_REQUIRED] Google Sheets account not connected. Connect your Google account to use Google Sheets.',
    );
  }

  // Validate credentials by calling the API
  const clients = await initializeGoogleClients(ctx);
  try {
    await clients.oauth2Client.getTokenInfo(clients.oauth2Client.credentials.access_token || '');
  } catch (apiError: unknown) {
    const err = apiError as { code?: number; message?: string };
    if (err.code === 401 || err.code === 403) {
      throw new Error(
        '[AUTH_EXPIRED] Google Sheets access token expired or revoked. Reconnect your Google account.',
      );
    }
    throw new Error(`[DEPENDENCY_UNAVAILABLE] Google API error: ${err.message ?? 'unknown'}`);
  }
  return { status: 'ready' as const, message: 'Google Sheets connected' };
});

registerTools(app);

export const factory = app.toFactory();
