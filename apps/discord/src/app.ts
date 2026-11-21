import { createApp } from '@agentapps/sdk';
import { validateCredentials } from './lib/index.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.discord',
  version: '2.0.0',
  name: 'Discord',
  description:
    'Full Discord integration: guilds, channels, messages, members, roles, webhooks, reactions, and moderation. Uses Discord REST API v10 with OAuth 2.0 / Bot Token.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'communication',
  keywords: ['discord', 'messaging', 'chat', 'guild', 'server', 'community', 'voice', 'moderation'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'discord',
    authorizeUrl: 'https://discord.com/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    scopes: [
      'identify',
      'guilds',
      'guilds.members.read',
      'bot',
      'messages.read',
      'applications.commands',
    ],
    pkce: false,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN'],
  },
});

app.health(async (ctx) => {
  await validateCredentials(ctx);
  return { status: 'ready' as const, message: 'Discord credentials valid' };
});

registerTools(app);

export const factory = app.toFactory();
