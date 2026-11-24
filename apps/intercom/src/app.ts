import { createApp } from '@agentapps/sdk';
import { intercomRequest } from './lib/intercom-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.intercom',
  version: '2.0.3',
  name: 'Intercom',
  description:
    'Intercom customer support integration — manage conversations, tickets, contacts, and teams via the Intercom API.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'other',
  keywords: ['intercom', 'customer-support', 'tickets', 'conversations', 'helpdesk', 'crm'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['ACCESS_TOKEN'] },
});

app.health(async (ctx) => {
  await intercomRequest(ctx, '/me');
  return { status: 'ready' as const, message: 'Intercom credentials are valid' };
});

registerTools(app);

export const factory = app.toFactory();
