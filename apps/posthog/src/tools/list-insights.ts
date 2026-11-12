/**
 * list_insights — list saved insights in PostHog.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerListInsightsTool(app: AgentApp): void {
  app.tool('list_insights', {
    description:
      'List saved insights (trends, funnels, retention, paths, etc.) in the PostHog project.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of insights to return (default 10).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const limit = (args.limit as number) ?? 10;
      return await posthogRequest('GET', 'insights', { query: { limit } }, ctx);
    },
  });
}
