/**
 * get-monitor — retrieve a single Datadog monitor by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { datadogRequest } from '../lib/datadog-client.js';

export function registerGetMonitorTool(app: AgentApp): void {
  app.tool('get-monitor', {
    description: 'Get detailed information about a specific Datadog monitor by its ID.',
    parameters: {
      type: 'object',
      properties: {
        monitorId: {
          type: 'number',
          description: 'The Datadog monitor ID.',
        },
      },
      required: ['monitorId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const monitorId = args.monitorId as number;
      return await datadogRequest('GET', `/api/v1/monitor/${monitorId}`, null, ctx);
    },
  });
}
