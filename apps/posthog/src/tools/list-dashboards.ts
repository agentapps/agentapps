/**
 * list_dashboards — list dashboards in PostHog.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerListDashboardsTool(app: AgentApp): void {
  app.tool('list_dashboards', {
    description: 'List all dashboards in the PostHog project.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of dashboards to return (default 10).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const limit = (args.limit as number) ?? 10;
      return await posthogRequest('GET', 'dashboards', { query: { limit } }, ctx);
    },
  });
}
