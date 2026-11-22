import { createApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from './lib/gmail-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.google.gmail',
  version: '2.0.2',
  name: 'Gmail',
  description:
    'Gmail email management — send, read, search, label, and filter emails via Google Gmail API.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'google',
  keywords: ['gmail', 'email', 'google', 'mail', 'messages'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    pkce: false,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EMAIL', 'EXPIRY_DATE'],
  },
});

app.health(async (ctx) => {
  const secrets = await getSecrets(ctx);

  // Check system secrets
  if (!secrets.CLIENT_ID) {
    throw new Error('Google OAuth Client ID not configured (system secret CLIENT_ID).');
  }
  if (!secrets.CLIENT_SECRET) {
    throw new Error('Google OAuth Client Secret not configured (system secret CLIENT_SECRET).');
  }

  // Check user credentials
  if (!secrets.ACCESS_TOKEN || !secrets.REFRESH_TOKEN) {
    throw new Error('Gmail account not connected. Connect your Google account to use Gmail.');
  }

  // Validate credentials by calling the Gmail API
  const { gmail } = await createGmailClient(secrets);
  await gmail.users.getProfile({ userId: 'me' });
  return { status: 'ready' as const, message: 'Gmail connected' };
});

registerTools(app);

export const factory = app.toFactory();
