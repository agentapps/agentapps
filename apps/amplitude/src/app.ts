/**
 * Amplitude Agent App — query events, user activity, cohorts,
 * charts, and retention data via the Amplitude API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.amplitude',
  version: '2.0.2',
  name: 'Amplitude',
  description:
    'Amplitude analytics — query events, user activity, cohorts, charts, and retention data.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'analytics',
  keywords: ['amplitude', 'analytics', 'events', 'cohorts', 'retention'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    systemSecrets: ['API_KEY', 'SECRET_KEY'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running Amplitude health check');

  const systemSecrets = await ctx.secrets.getSystem();

  const apiKey = systemSecrets?.API_KEY;
  const secretKey = systemSecrets?.SECRET_KEY;

  if (!apiKey || !secretKey) {
    return {
      status: 'not_ready',
      message: 'Missing Amplitude credentials',
      issues: [
        ...(!apiKey
          ? [
              {
                code: 'MISSING_SECRET',
                message: 'API_KEY system secret is required — your Amplitude API key',
                severity: 'error' as const,
              },
            ]
          : []),
        ...(!secretKey
          ? [
              {
                code: 'MISSING_SECRET',
                message: 'SECRET_KEY system secret is required — your Amplitude secret key',
                severity: 'error' as const,
              },
            ]
          : []),
      ],
    };
  }

  // Validate credentials by calling a lightweight endpoint
  const basicAuth = btoa(`${apiKey}:${secretKey}`);
  const url = 'https://analytics.amplitude.com/api/3/annotations';
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Amplitude API error: ${(body as Record<string, unknown>)?.error ?? res.statusText}`,
    );
  }

  return { status: 'ready' as const, message: 'Amplitude connected' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
