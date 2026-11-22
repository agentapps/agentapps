import { createApp } from '@agentapps/sdk';
import { initializeGoogleClients } from './lib/google-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.google.docs',
  version: '2.0.1',
  name: 'Google Docs',
  description:
    'Create, read, and edit Google Docs documents - create, read content, insert text, append text, delete content, insert tables, insert images, find & replace, text styling, named ranges, batch updates. To delete a document, use the Google Drive app.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'google',
  keywords: ['google', 'docs', 'documents', 'write', 'edit', 'create'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/documents.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    pkce: false,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN'],
  },
});

app.health(async (ctx) => {
  const systemSecrets = await ctx.secrets.getSystem();
  const installationSecrets = await ctx.secrets.getInstallation();

  if (!systemSecrets?.CLIENT_ID) {
    throw new Error('Google OAuth Client ID not configured in system secrets.');
  }
  if (!systemSecrets?.CLIENT_SECRET) {
    throw new Error('Google OAuth Client Secret not configured in system secrets.');
  }

  if (!installationSecrets?.ACCESS_TOKEN || !installationSecrets?.REFRESH_TOKEN) {
    throw new Error(
      'Google account not connected. Connect your Google account to use Google Docs.',
    );
  }

  const clients = await initializeGoogleClients(ctx);
  await clients.oauth2Client.getTokenInfo(clients.oauth2Client.credentials.access_token || '');
  return { status: 'ready' as const, message: 'Google Docs connected' };
});

registerTools(app);

export const factory = app.toFactory();
