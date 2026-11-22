import { createApp } from '@agentapps/sdk';
import { validateCredentials } from './lib/hubspot-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.hubspot',
  version: '2.0.1',
  name: 'HubSpot',
  description:
    'HubSpot CRM integration — manage contacts, companies, deals, tickets, engagements, lists, and conversations via HubSpot REST API v3 with OAuth2.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'other',
  keywords: [
    'hubspot',
    'crm',
    'contacts',
    'deals',
    'tickets',
    'sales',
    'marketing',
    'engagements',
    'pipelines',
  ],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'hubspot',
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN'],
    authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    scopes: [
      'oauth',
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.companies.read',
      'crm.objects.companies.write',
      'crm.objects.deals.read',
      'crm.objects.deals.write',
      'crm.objects.owners.read',
    ],
    optionalScopes: [
      'tickets',
      'crm.lists.read',
      'crm.lists.write',
      'conversations.read',
      'conversations.write',
    ],
    pkce: false,
  },
});

app.health(async (ctx) => {
  await validateCredentials(ctx);
  return { status: 'ready' as const, message: 'HubSpot credentials are valid' };
});

registerTools(app);

export const factory = app.toFactory();
