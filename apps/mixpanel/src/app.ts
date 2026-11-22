/**
 * Mixpanel Agent App — track events, query funnels, retention,
 * user profiles, and export data via the Mixpanel API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.mixpanel',
  version: '2.0.1',
  name: 'Mixpanel',
  description:
    'Mixpanel analytics — track events, query funnels, retention, user profiles, and export data.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'analytics',
  keywords: ['mixpanel', 'analytics', 'events', 'funnels', 'retention'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    systemSecrets: ['PROJECT_ID'],
    installationSecrets: ['SERVICE_ACCOUNT_USERNAME', 'SERVICE_ACCOUNT_SECRET'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running Mixpanel health check');

  const systemSecrets = await ctx.secrets.getSystem();
  const installationSecrets = await ctx.secrets.getInstallation();

  const projectId = systemSecrets?.PROJECT_ID;
  const username = installationSecrets?.SERVICE_ACCOUNT_USERNAME;
  const secret = installationSecrets?.SERVICE_ACCOUNT_SECRET;

  if (!projectId || !username || !secret) {
    return {
      status: 'not_ready',
      message: 'Missing Mixpanel credentials',
      issues: [
        ...(!projectId
          ? [
              {
                code: 'MISSING_SECRET',
                message: 'PROJECT_ID system secret is required — your Mixpanel project ID',
                severity: 'error' as const,
              },
            ]
          : []),
        ...(!username
          ? [
              {
                code: 'MISSING_SECRET',
                message:
                  'SERVICE_ACCOUNT_USERNAME user secret is required — your Mixpanel service account username',
                severity: 'error' as const,
              },
            ]
          : []),
        ...(!secret
          ? [
              {
                code: 'MISSING_SECRET',
                message:
                  'SERVICE_ACCOUNT_SECRET user secret is required — your Mixpanel service account secret',
                severity: 'error' as const,
              },
            ]
          : []),
      ],
    };
  }

  // Validate credentials by calling a lightweight endpoint
  const basicAuth = btoa(`${username}:${secret}`);
  const url = `https://mixpanel.com/api/query/funnels/list?project_id=${encodeURIComponent(projectId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Mixpanel API error: ${(body as Record<string, unknown>)?.error ?? res.statusText}`,
    );
  }

  return { status: 'ready' as const, message: 'Mixpanel connected' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
