/**
 * update-organization — update an existing organization in Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerUpdateOrganizationTool(app: AgentApp): void {
  app.tool('update-organization', {
    description: 'Update an existing organization in Pipedrive. Supports changing name and owner.',
    parameters: {
      type: 'object',
      properties: {
        orgId: {
          type: 'number',
          description: 'The ID of the organization to update.',
        },
        name: {
          type: 'string',
          description: 'New name for the organization.',
        },
        owner_id: {
          type: 'number',
          description: 'New owner user ID for the organization.',
        },
      },
      required: ['orgId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const orgId = args.orgId as number;
      const body: Record<string, unknown> = {};
      if (args.name) body.name = args.name;
      if (args.owner_id) body.owner_id = args.owner_id;

      return await pipedriveRequest('PUT', `/organizations/${orgId}`, { body }, ctx);
    },
  });
}
