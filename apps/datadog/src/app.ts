/**
 * Datadog Agent App — query metrics, list monitors, manage incidents,
 * search logs, and check service status via the Datadog API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.datadog',
  version: '3.0.0',
  name: 'Datadog',
  description:
    'Datadog monitoring — query metrics, list monitors, manage incidents, search logs, and check service status.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'devops',
  keywords: ['datadog', 'monitoring', 'metrics', 'logs', 'apm'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    installationSecrets: ['API_KEY', 'APP_KEY'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running Datadog health check');

  const installationSecrets = await ctx.secrets.getInstallation();
  const apiKey = installationSecrets?.API_KEY;
  const appKey = installationSecrets?.APP_KEY;

  if (!apiKey || !appKey) {
    return {
      status: 'not_ready',
      message: 'Missing Datadog credentials',
      issues: [
        ...(!apiKey
          ? [
              {
                code: 'MISSING_SECRET',
                message: 'API_KEY user secret is required — use your Datadog API key',
                severity: 'error' as const,
              },
            ]
          : []),
        ...(!appKey
          ? [
              {
                code: 'MISSING_SECRET',
                message: 'APP_KEY user secret is required — use your Datadog application key',
                severity: 'error' as const,
              },
            ]
          : []),
      ],
    };
  }

  const res = await fetch('https://api.datadoghq.com/api/v1/validate', {
    headers: {
      'DD-API-KEY': apiKey,
      'DD-APPLICATION-KEY': appKey,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Datadog API error: ${(body as Record<string, unknown>)?.errors?.[0] ?? res.statusText}`,
    );
  }

  return { status: 'ready' as const, message: 'Datadog connected' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
