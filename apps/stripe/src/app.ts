/**
 * Stripe Agent App — manage customers, payments, invoices, subscriptions,
 * and payment links via the Stripe API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.stripe',
  version: '3.0.0',
  name: 'Stripe',
  description:
    'Stripe payment processing — manage customers, payments, invoices, subscriptions, products, prices, charges, refunds, checkout sessions, payouts, and payment links.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'finance',
  keywords: ['stripe', 'payments', 'invoices', 'subscriptions', 'billing'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    systemSecrets: ['API_KEY'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running Stripe health check');

  const secrets = await ctx.secrets.getSystem();
  if (!secrets?.API_KEY) {
    return {
      status: 'not_ready',
      message: 'Missing Stripe API key',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'API_KEY system secret is required — use your Stripe secret key (sk_live_... or sk_test_...)',
          severity: 'error' as const,
        },
      ],
    };
  }

  const res = await fetch('https://api.stripe.com/v1/balance', {
    headers: { Authorization: `Bearer ${secrets.API_KEY}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Stripe API error: ${body?.error?.message || res.statusText}`);
  }

  return { status: 'ready', message: 'Stripe connected' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
