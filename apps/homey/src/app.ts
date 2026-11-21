import { createApp } from '@agentapps/sdk';
import { getSecrets, initHomeyApi, invalidateAllCaches } from './lib/index.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.homey',
  version: '2.0.0',
  name: 'Homey',
  description:
    'Homey smart home controller — control devices, manage flows, and monitor your home via Athom Cloud API.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'other',
  keywords: ['homey', 'home-automation', 'iot', 'devices', 'flows', 'athom'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'homey',
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'TOKEN_TYPE', 'EXPIRES_IN'],
    authorizeUrl: 'https://api.athom.com/oauth2/authorise',
    tokenUrl: 'https://api.athom.com/oauth2/token',
    scopes: [
      'account.homeys',
      'homey.app.readonly',
      'homey.device.readonly',
      'homey.device.control',
      'homey.energy.readonly',
      'homey.flow.readonly',
      'homey.flow.start',
      'homey.insights.readonly',
      'homey.logic',
      'homey.logic.readonly',
      'homey.notifications.readonly',
      'homey.presence.readonly',
      'homey.presence.self',
      'homey.user.readonly',
      'homey.user.self',
      'homey.zone.readonly',
    ],
    scopeSeparator: ',',
    pkce: false,
  },
});

app.health(async (ctx) => {
  const secrets = await getSecrets(ctx);

  if (!secrets.CLIENT_ID || !secrets.CLIENT_SECRET) {
    throw new Error('Homey CLIENT_ID or CLIENT_SECRET not configured in system secrets.');
  }

  if (!secrets.ACCESS_TOKEN || !secrets.REFRESH_TOKEN) {
    throw new Error('Homey account not connected. Please connect your Homey account via OAuth2.');
  }

  // Verify connectivity with a real API call
  invalidateAllCaches();
  const api = await initHomeyApi(secrets);
  await api.users.getUsers();
  return { status: 'ready' as const, message: 'Homey connected' };
});

registerTools(app);

export const factory = app.toFactory();
