import { createApp } from '@agentapps/sdk';
import { initializeGoogleClients } from './lib/index.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.google.drive',
  version: '2.1.0',
  name: 'Google Drive',
  description:
    'Manage Google Drive files and folders - upload, download, share, search, read content',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'google',
  keywords: ['google', 'drive', 'files', 'storage'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
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
      '[AUTH_REQUIRED] Google Drive account not connected. Connect your Google account to use Google Drive.',
    );
  }

  // Validate credentials by calling the API
  const clients = await initializeGoogleClients(ctx);
  try {
    await clients.drive.about.get({ fields: 'user' });
  } catch (apiError: unknown) {
    const err = apiError as { code?: number; message?: string };
    if (err.code === 401 || err.code === 403) {
      throw new Error(
        '[AUTH_EXPIRED] Google Drive access token expired or revoked. Reconnect your Google account.',
      );
    }
    throw new Error(`[DEPENDENCY_UNAVAILABLE] Google Drive API error: ${err.message ?? 'unknown'}`);
  }
  return { status: 'ready' as const, message: 'Google Drive connected' };
});

registerTools(app);

export const factory = app.toFactory();
