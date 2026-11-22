import { createApp } from '@agentapps/sdk';
import { hunterGet } from './lib/hunter-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.hunter',
  version: '2.0.1',
  name: 'Hunter',
  description:
    "Hunter.io email finder — find professional email addresses by domain, guess a person's email from their name, and verify email deliverability.",
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'data',
  keywords: [
    'hunter',
    'email',
    'email-finder',
    'email-verifier',
    'domain-search',
    'lead-generation',
    'prospecting',
    'data',
  ],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['HUNTER_API_KEY'] },
});

app.health(async (ctx) => {
  // /account validates the key without spending credits.
  await hunterGet(ctx, '/account', { timeoutMs: 5000, maxRetries: 0 });
  return { status: 'ready' as const, message: 'Hunter API key is valid' };
});

registerTools(app);

export const factory = app.toFactory();
