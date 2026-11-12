/**
 * PostHog Agent App — product analytics: events, persons, feature flags,
 * insights, cohorts, and annotations via the PostHog API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.posthog',
  version: '2.1.0',
  name: 'PostHog',
  description:
    'PostHog product analytics — events, persons, feature flags, insights, cohorts, annotations, actions, dashboards, experiments, and session recordings.',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'analytics',
  keywords: [
    'posthog',
    'analytics',
    'events',
    'feature-flags',
    'insights',
    'experiments',
    'dashboards',
    'actions',
  ],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    systemSecrets: ['API_KEY', 'PROJECT_ID'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running PostHog health check');

  const secrets = await ctx.secrets.getSystem();
  const apiKey = secrets?.API_KEY;
  const projectId = secrets?.PROJECT_ID;

  if (!apiKey || !projectId) {
    return {
      status: 'not_ready',
      message: 'Missing PostHog credentials',
      issues: [
        ...(!apiKey
          ? [
              {
                code: 'MISSING_SECRET',
                message:
                  'API_KEY system secret is required — create a personal API key at https://app.posthog.com/settings/user-api-keys',
                severity: 'error' as const,
              },
            ]
          : []),
        ...(!projectId
          ? [
              {
                code: 'MISSING_SECRET',
                message:
                  'PROJECT_ID system secret is required — find it in your PostHog project settings',
                severity: 'error' as const,
              },
            ]
          : []),
      ],
    };
  }

  const res = await fetch(`https://app.posthog.com/api/projects/${projectId}/`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `PostHog API error: ${(body as Record<string, unknown>)?.detail ?? res.statusText}`,
    );
  }

  return { status: 'ready' as const, message: 'PostHog connected' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
