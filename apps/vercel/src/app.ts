/**
 * Vercel Agent App — manage projects, deployments, domains,
 * environment variables, and check deployment logs via the Vercel API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.vercel',
  version: '2.0.1',
  name: 'Vercel',
  description:
    'Vercel platform management — manage projects, deployments, domains, environment variables, and check deployment logs.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'development',
  keywords: ['vercel', 'deploy', 'hosting', 'serverless', 'nextjs'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    installationSecrets: ['API_TOKEN'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running Vercel health check');

  const secrets = await ctx.secrets.getInstallation();
  if (!secrets?.API_TOKEN) {
    return {
      status: 'not_ready',
      message: 'Missing Vercel API token',
      issues: [
        {
          code: 'MISSING_SECRET',
          message: 'API_TOKEN user secret is required — use your Vercel personal access token',
          severity: 'error' as const,
        },
      ],
    };
  }

  const res = await fetch('https://api.vercel.com/v2/user', {
    headers: { Authorization: `Bearer ${secrets.API_TOKEN}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Vercel API error: ${body?.error?.message || res.statusText}`);
  }

  const result = (await res.json()) as { user: { username: string } };
  return { status: 'ready' as const, message: `Vercel connected as ${result.user.username}` };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
