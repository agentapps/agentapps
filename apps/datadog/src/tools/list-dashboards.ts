/**
 * list_dashboards — list Datadog dashboards.
 */

import type { AgentApp } from '@agentapps/sdk';
import { datadogRequest } from '../lib/datadog-client.js';

export function registerListDashboardsTool(app: AgentApp): void {
  app.tool('list_dashboards', {
    description:
      'List dashboards from your Datadog account. Optionally limit the number of results.',
    parameters: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Maximum number of dashboards to return.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const query: Record<string, string | number | boolean | undefined | null> = {};
      if (args.count !== undefined) query.count = args.count as number;

      return await datadogRequest('GET', '/api/v1/dashboard', { query }, ctx);
    },
  });
}
