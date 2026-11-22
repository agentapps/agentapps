/**
 * get-dashboard — retrieve a single PostHog dashboard by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerGetDashboardTool(app: AgentApp): void {
  app.tool('get-dashboard', {
    description: 'Get detailed information about a specific PostHog dashboard by its ID.',
    parameters: {
      type: 'object',
      properties: {
        dashboardId: {
          type: 'number',
          description: 'The PostHog dashboard ID.',
        },
      },
      required: ['dashboardId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const dashboardId = args.dashboardId as number;
      return await posthogRequest('GET', `dashboards/${dashboardId}`, null, ctx);
    },
  });
}
