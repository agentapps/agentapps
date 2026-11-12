/**
 * get-person — get a single person (contact) by ID from Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerGetPersonTool(app: AgentApp): void {
  app.tool('get-person', {
    description:
      'Get details of a specific person (contact) by their ID, including email, phone, and associated organization.',
    parameters: {
      type: 'object',
      properties: {
        personId: {
          type: 'number',
          description: 'The ID of the person to retrieve.',
        },
      },
      required: ['personId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const personId = args.personId as number;
      return await pipedriveRequest('GET', `/persons/${personId}`, {}, ctx);
    },
  });
}
