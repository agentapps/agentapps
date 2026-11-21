/**
 * Holded Agent App — manage invoices, contacts, products, and treasury
 * via the Holded ERP API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.holded',
  version: '2.0.0',
  name: 'Holded',
  description:
    'Holded ERP — manage invoices, contacts, products, documents, and treasury via the Holded API.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'finance',
  keywords: ['holded', 'erp', 'invoices', 'accounting', 'spain'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    systemSecrets: ['API_KEY'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running Holded health check');

  const secrets = await ctx.secrets.getSystem();
  if (!secrets?.API_KEY) {
    return {
      status: 'not_ready',
      message: 'Missing Holded API key',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'API_KEY system secret is required — use your Holded API key from Settings > API.',
          severity: 'error' as const,
        },
      ],
    };
  }

  // Lightweight validation: fetch contacts list (small payload)
  const res = await fetch(
    `https://api.holded.com/api/invoicing/v1/contacts?key=${secrets.API_KEY}`,
    { headers: { Accept: 'application/json' } },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Holded API error: ${body?.message || body?.error || res.statusText}`);
  }

  return { status: 'ready', message: 'Holded connected' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
