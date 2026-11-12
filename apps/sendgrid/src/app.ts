/**
 * SendGrid Agent App — send emails, manage contacts, lists, templates,
 * and view statistics via the SendGrid API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.sendgrid',
  version: '2.0.0',
  name: 'SendGrid',
  description:
    'SendGrid email delivery — send emails, manage contacts, lists, templates, and view statistics.',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'communication',
  keywords: ['sendgrid', 'email', 'delivery', 'marketing', 'transactional'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    systemSecrets: ['API_KEY'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running SendGrid health check');

  const secrets = await ctx.secrets.getSystem();
  if (!secrets?.API_KEY) {
    return {
      status: 'not_ready',
      message: 'Missing SendGrid API key',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'API_KEY system secret is required — use your SendGrid API key (Settings → API Keys)',
          severity: 'error' as const,
        },
      ],
    };
  }

  const res = await fetch('https://api.sendgrid.com/v3/user/profile', {
    headers: { Authorization: `Bearer ${secrets.API_KEY}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `SendGrid API error: ${(body as Record<string, unknown>)?.errors ?? res.statusText}`,
    );
  }

  return { status: 'ready', message: 'SendGrid connected' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
