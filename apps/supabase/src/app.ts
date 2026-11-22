/**
 * Supabase Agent App — query tables, manage rows, list buckets,
 * and manage storage files via the Supabase API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.supabase',
  version: '2.0.2',
  name: 'Supabase',
  description:
    'Supabase database and storage — query tables, manage rows, run SQL, list buckets, and upload/download files.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'database',
  keywords: ['supabase', 'database', 'postgres', 'storage', 'sql'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    systemSecrets: ['SUPABASE_URL', 'SUPABASE_KEY'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running Supabase health check');

  const secrets = await ctx.secrets.getSystem();
  if (!secrets?.SUPABASE_URL || !secrets?.SUPABASE_KEY) {
    return {
      status: 'not_ready',
      message: 'Missing Supabase credentials',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'SUPABASE_URL and SUPABASE_KEY system secrets are required — use your project URL and service_role or anon key.',
          severity: 'error' as const,
        },
      ],
    };
  }

  const url = secrets.SUPABASE_URL.replace(/\/+$/, '');
  const res = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: secrets.SUPABASE_KEY,
      Authorization: `Bearer ${secrets.SUPABASE_KEY}`,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Supabase API error: ${(body as Record<string, unknown>)?.message || res.statusText}`,
    );
  }

  return { status: 'ready' as const, message: 'Supabase connected' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
