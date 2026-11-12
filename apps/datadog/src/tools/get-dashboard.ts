/**
 * get_dashboard — retrieve a single Datadog dashboard by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { datadogRequest } from '../lib/datadog-client.js';

export function registerGetDashboardTool(app: AgentApp): void {
  app.tool('get_dashboard', {
    description: 'Get detailed information about a specific Datadog dashboard by its ID.',
    parameters: {
      type: 'object',
      properties: {
        dashboardId: {
          type: 'string',
          description: 'The Datadog dashboard ID (e.g. "abc-def-ghi").',
        },
      },
      required: ['dashboardId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const dashboardId = args.dashboardId as string;
      return await datadogRequest('GET', `/api/v1/dashboard/${dashboardId}`, null, ctx);
    },
  });
}
