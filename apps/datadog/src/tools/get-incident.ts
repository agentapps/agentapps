/**
 * get_incident — retrieve a single Datadog incident by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { datadogRequest } from '../lib/datadog-client.js';

export function registerGetIncidentTool(app: AgentApp): void {
  app.tool('get_incident', {
    description: 'Get detailed information about a specific Datadog incident by its ID.',
    parameters: {
      type: 'object',
      properties: {
        incidentId: {
          type: 'string',
          description: 'The Datadog incident ID.',
        },
      },
      required: ['incidentId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const incidentId = args.incidentId as string;
      return await datadogRequest('GET', `/api/v2/incidents/${incidentId}`, null, ctx);
    },
  });
}
