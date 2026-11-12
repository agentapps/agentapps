/**
 * create-organization — create a new organization in Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerCreateOrganizationTool(app: AgentApp): void {
  app.tool('create-organization', {
    description: 'Create a new organization in Pipedrive. Returns the created organization object.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the organization (required).',
        },
        owner_id: {
          type: 'number',
          description: 'ID of the user who will own this organization.',
        },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = { name: args.name };
      if (args.owner_id) body.owner_id = args.owner_id;

      return await pipedriveRequest('POST', '/organizations', { body }, ctx);
    },
  });
}
