/**
 * Pipedrive Agent App — manage deals, persons, organizations, activities,
 * and pipelines via the Pipedrive CRM API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.pipedrive',
  version: '2.0.0',
  name: 'Pipedrive',
  description: 'Pipedrive CRM — manage deals, persons, organizations, activities, and pipelines.',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'crm',
  keywords: ['pipedrive', 'crm', 'deals', 'sales', 'pipeline'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    installationSecrets: ['API_TOKEN'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running Pipedrive health check');

  const secrets = await ctx.secrets.getInstallation();
  if (!secrets?.API_TOKEN) {
    return {
      status: 'not_ready',
      message: 'Missing Pipedrive API token',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'API_TOKEN user secret is required — use your Pipedrive API token from Settings > Personal preferences > API.',
          severity: 'error' as const,
        },
      ],
    };
  }

  // Validate credentials by fetching the current user
  const apiToken = secrets.API_TOKEN;
  const res = await fetch(
    `https://api.pipedrive.com/v1/users/me?api_token=${encodeURIComponent(apiToken)}`,
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Pipedrive API error: ${(body as Record<string, unknown>)?.error ?? res.statusText}`,
    );
  }

  return { status: 'ready', message: 'Pipedrive connected' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
