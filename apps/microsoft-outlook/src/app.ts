import { createApp } from '@agentapps/sdk';
import { createGraphClient } from './lib/index.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.microsoft.outlook',
  version: '2.0.0',
  name: 'Outlook',
  description:
    'Microsoft Outlook email management — send, read, search, and organize emails via Microsoft Graph API.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: ['outlook', 'email', 'microsoft', 'mail', 'messages', 'office365', 'hotmail'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'microsoft',
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EMAIL', 'EXPIRY_DATE'],
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: [
      'openid',
      'profile',
      'email',
      'offline_access',
      'Mail.Read',
      'Mail.ReadWrite',
      'Mail.Send',
      'User.Read',
    ],
    pkce: false,
  },
});

app.health(async (ctx) => {
  const { graphRequest } = await createGraphClient(ctx);
  await graphRequest('GET', '/me');
  return { status: 'ready' as const, message: 'Microsoft Outlook connected' };
});

registerTools(app);

export const factory = app.toFactory();
