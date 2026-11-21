import { createApp } from '@agentapps/sdk';
import { initializeGoogleClients } from './lib/google-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.google.slides',
  version: '2.0.0',
  name: 'Google Slides',
  description:
    'Create, read, update, and delete Google Slides presentations — full read/write support for slides, text, and batch operations',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'google',
  keywords: ['google', 'slides', 'presentation', 'deck'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/presentations',
      'https://www.googleapis.com/auth/presentations.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    pkce: false,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN'],
  },
});

app.health(async (ctx) => {
  const clients = await initializeGoogleClients(ctx);
  await clients.oauth2Client.getTokenInfo(clients.oauth2Client.credentials.access_token || '');
  return { status: 'ready' as const, message: 'Google Slides connected' };
});

registerTools(app);

export const factory = app.toFactory();
