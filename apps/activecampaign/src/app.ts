import { createApp } from '@agentapps/sdk';
import { acPing } from './lib/index.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.activecampaign',
  version: '2.0.0',
  name: 'ActiveCampaign',
  description:
    'ActiveCampaign CRM and email marketing — manage contacts, lists, campaigns, deals, and tags via the v3 API.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'communication',
  keywords: [
    'activecampaign',
    'crm',
    'email-marketing',
    'marketing-automation',
    'contacts',
    'campaigns',
    'deals',
  ],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    installationSecrets: ['ACTIVECAMPAIGN_BASE_URL', 'ACTIVECAMPAIGN_API_TOKEN'],
  },
});

app.health(async (ctx) => {
  const installationSecrets = await ctx.secrets.getInstallation();
  if (
    !installationSecrets?.ACTIVECAMPAIGN_BASE_URL ||
    !installationSecrets?.ACTIVECAMPAIGN_API_TOKEN
  ) {
    return {
      status: 'not_ready' as const,
      message: 'ActiveCampaign credentials not configured',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'ACTIVECAMPAIGN_BASE_URL and ACTIVECAMPAIGN_API_TOKEN installation secrets are required',
          severity: 'error' as const,
        },
      ],
    };
  }
  await acPing(ctx);
  return { status: 'ready' as const, message: 'ActiveCampaign API is reachable' };
});

registerTools(app);

export const factory = app.toFactory();
