import { createApp } from '@agentapps/sdk';
import { validateCredentials } from './lib/index.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.salesforce',
  version: '2.0.0',
  name: 'Salesforce',
  description:
    'Salesforce CRM — manage accounts, contacts, opportunities, leads, cases, and run SOQL queries.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'crm',
  keywords: ['salesforce', 'crm', 'sales', 'leads', 'opportunities'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'oauth2',
    provider: 'salesforce',
    authorizeUrl: 'https://login.salesforce.com/services/oauth2/authorize',
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    scopes: ['api', 'refresh_token'],
    pkce: false,
    systemSecrets: ['CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'],
    installationSecrets: ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'INSTANCE_URL'],
  },
});

app.health(async (ctx) => {
  await validateCredentials(ctx);
  return { status: 'ready' as const, message: 'Salesforce credentials are valid' };
});

registerTools(app);

export const factory = app.toFactory();
