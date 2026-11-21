import { createApp } from '@agentapps/sdk';
import { mailchimpRequest } from './lib/mailchimp-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.mailchimp',
  version: '2.0.0',
  name: 'Mailchimp',
  description:
    'Mailchimp email marketing — manage audiences, campaigns, subscribers, templates, and automations.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'marketing',
  keywords: ['mailchimp', 'email', 'marketing', 'campaigns', 'newsletters'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['API_KEY'] },
});

app.health(async (ctx) => {
  await mailchimpRequest(ctx, '/ping');
  return { status: 'ready' as const };
});

registerTools(app);

export const factory = app.toFactory();
