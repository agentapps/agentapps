/**
 * Airtable Agent App — manage bases, tables, and records via the Airtable API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.airtable',
  version: '3.0.0',
  name: 'Airtable',
  description:
    'Airtable base management — list bases, query records, create/update/delete rows, and manage tables.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'database',
  keywords: ['airtable', 'database', 'spreadsheet', 'records', 'tables'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    installationSecrets: ['API_TOKEN'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running Airtable health check');

  const installationSecrets = await ctx.secrets.getInstallation().catch(() => null);
  const token = installationSecrets?.API_TOKEN;

  if (!token) {
    return {
      status: 'not_ready' as const,
      message: 'Missing Airtable personal access token',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'API_TOKEN user secret is required — use your Airtable personal access token (pat...)',
          severity: 'error' as const,
        },
      ],
    };
  }

  const res = await fetch('https://api.airtable.com/v0/meta/bases', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Airtable API error: ${body?.error?.message || res.statusText}`);
  }

  return { status: 'ready' as const, message: 'Airtable connected' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
