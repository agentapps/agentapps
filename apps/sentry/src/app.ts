/**
 * Sentry Agent App — error monitoring, issue tracking, and event inspection.
 *
 * Migrated from mca.sentry (the legacy MCA).
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.sentry',
  version: '1.0.1',
  name: 'Sentry',
  description: 'Monitor errors and issues in your applications via the Sentry API.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'devops',
  keywords: ['sentry', 'errors', 'monitoring', 'issues', 'debugging'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    systemSecrets: ['API_KEY', 'ORGANIZATION'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running health check');

  const secrets = await ctx.secrets.getSystem();
  if (!secrets?.API_KEY) {
    return {
      status: 'not_ready',
      message: 'Missing Sentry API key',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'API_KEY system secret is required — get one at https://sentry.io/settings/account/api/auth-tokens/',
          severity: 'error' as const,
        },
      ],
    };
  }

  return { status: 'ready', message: 'Sentry ready' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
