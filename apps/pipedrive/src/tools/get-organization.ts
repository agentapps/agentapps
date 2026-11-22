/**
 * get-organization — get a single organization by ID from Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerGetOrganizationTool(app: AgentApp): void {
  app.tool('get-organization', {
    description:
      'Get details of a specific organization by its ID, including address, people count, and custom fields.',
    parameters: {
      type: 'object',
      properties: {
        orgId: {
          type: 'number',
          description: 'The ID of the organization to retrieve.',
        },
      },
      required: ['orgId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const orgId = args.orgId as number;
      return await pipedriveRequest('GET', `/organizations/${orgId}`, {}, ctx);
    },
  });
}
