import { createApp } from '@agentapps/sdk';
import { RailwayClient } from './lib/railway-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.railway',
  version: '3.0.0',
  name: 'Railway',
  description:
    'Deploy projects to Railway directly from your workspace. Supports automatic deployments, environment management, and database provisioning.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'development',
  keywords: [
    'railway',
    'deploy',
    'paas',
    'hosting',
    'docker',
    'deployment',
    'staging',
    'production',
  ],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['RAILWAY_TOKEN'] },
});

app.health(async (ctx) => {
  const secrets = await ctx.secrets.getInstallation();
  const token = secrets?.RAILWAY_TOKEN || secrets?.railwayToken;

  if (!token) {
    throw new Error(
      'Railway API token not configured. Add your RAILWAY_TOKEN in the app settings. Get your token from https://railway.app/account/tokens',
    );
  }

  const client = new RailwayClient(token);
  const isValid = await client.validateToken();

  if (!isValid) {
    throw new Error(
      'Railway API token is invalid or expired. Generate a new one at https://railway.app/account/tokens',
    );
  }
  return { status: 'ready' as const, message: 'Railway API token is valid' };
});

registerTools(app);

export const factory = app.toFactory();
