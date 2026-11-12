/**
 * list_experiments — list experiments (A/B tests) in PostHog.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerListExperimentsTool(app: AgentApp): void {
  app.tool('list_experiments', {
    description: 'List all experiments (A/B tests) configured in the PostHog project.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of experiments to return (default 10).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const limit = (args.limit as number) ?? 10;
      return await posthogRequest('GET', 'experiments', { query: { limit } }, ctx);
    },
  });
}
