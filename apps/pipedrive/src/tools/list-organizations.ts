/**
 * list-organizations — list organizations from Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerListOrganizationsTool(app: AgentApp): void {
  app.tool('list-organizations', {
    description: 'List organizations from your Pipedrive account. Supports pagination and sorting.',
    parameters: {
      type: 'object',
      properties: {
        start: {
          type: 'number',
          description: 'Pagination start (offset). Default 0.',
        },
        limit: {
          type: 'number',
          description: 'Number of organizations to return (1-500, default 100).',
        },
        sort: {
          type: 'string',
          description: 'Field and direction to sort by, e.g. "name ASC".',
        },
        filter_id: {
          type: 'number',
          description: 'ID of the filter to apply.',
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
      const params: Record<string, string | number | boolean | undefined> = {};
      if (args.start !== undefined) params.start = args.start as number;
      if (args.limit) params.limit = args.limit as number;
      if (args.sort) params.sort = args.sort as string;
      if (args.filter_id) params.filter_id = args.filter_id as number;

      return await pipedriveRequest('GET', '/organizations', { params }, ctx);
    },
  });
}
