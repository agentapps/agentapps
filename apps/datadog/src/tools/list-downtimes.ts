/**
 * list_downtimes — list scheduled Datadog downtimes.
 */

import type { AgentApp } from '@agentapps/sdk';
import { datadogRequest } from '../lib/datadog-client.js';

export function registerListDowntimesTool(app: AgentApp): void {
  app.tool('list_downtimes', {
    description:
      'List scheduled downtimes from your Datadog account. Optionally filter to only show currently active downtimes.',
    parameters: {
      type: 'object',
      properties: {
        currentOnly: {
          type: 'boolean',
          description: 'If true, only return downtimes that are currently active (default false).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const query: Record<string, string | number | boolean | undefined | null> = {};
      if (args.currentOnly !== undefined) query.current_only = args.currentOnly as boolean;

      return await datadogRequest('GET', '/api/v1/downtime', { query }, ctx);
    },
  });
}
