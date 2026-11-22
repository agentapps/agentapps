import { createApp } from '@agentapps/sdk';
import { validateCredentials } from './lib/zendesk-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.zendesk',
  version: '2.0.2',
  name: 'Zendesk',
  description:
    'Zendesk support integration — manage tickets, users, organizations, views, groups, triggers, automations, attachments, webhooks, and satisfaction ratings via the Zendesk REST API v2 with rate limiting.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'other',
  keywords: ['zendesk', 'customer-support', 'tickets', 'helpdesk', 'support', 'crm'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['SUBDOMAIN', 'EMAIL', 'API_TOKEN'] },
});

app.health(async (ctx) => {
  await validateCredentials(ctx);
  return { status: 'ready' as const, message: 'Zendesk credentials are valid' };
});

registerTools(app);

export const factory = app.toFactory();
