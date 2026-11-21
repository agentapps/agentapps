import { createApp } from '@agentapps/sdk';
import { brevoRequest } from './lib/brevo-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.brevo',
  version: '2.0.0',
  name: 'Brevo',
  description:
    'Brevo email marketing — send transactional emails, manage contacts and lists, create email templates, and browse email campaigns through the Brevo API.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'communication',
  keywords: [
    'brevo',
    'sendinblue',
    'email',
    'email-marketing',
    'transactional-email',
    'contacts',
    'campaigns',
  ],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['BREVO_API_KEY'] },
});

app.health(async (ctx) => {
  await brevoRequest(ctx, '/account');
  return { status: 'ready' as const };
});

registerTools(app);

export const factory = app.toFactory();
