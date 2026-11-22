/**
 * Cloudflare Agent App — manage DNS records, zones, Workers,
 * KV namespaces, and purge cache via the Cloudflare API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.cloudflare',
  version: '3.0.0',
  name: 'Cloudflare',
  description:
    'Cloudflare platform management — manage DNS records, zones, Workers, KV namespaces, page rules, firewall rules, analytics, and cache purging.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'development',
  keywords: ['cloudflare', 'dns', 'cdn', 'workers', 'cache'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    installationSecrets: ['API_TOKEN'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running Cloudflare health check');

  const secrets = await ctx.secrets.getInstallation();
  if (!secrets?.API_TOKEN) {
    return {
      status: 'not_ready',
      message: 'Missing Cloudflare API token',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'API_TOKEN user secret is required — use a Cloudflare API token with appropriate permissions',
          severity: 'error' as const,
        },
      ],
    };
  }

  const res = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
    headers: { Authorization: `Bearer ${secrets.API_TOKEN}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const errors = (body as Record<string, unknown>)?.errors as
      | Array<{ message: string }>
      | undefined;
    throw new Error(`Cloudflare API error: ${errors?.[0]?.message || res.statusText}`);
  }

  return { status: 'ready' as const, message: 'Cloudflare connected' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
