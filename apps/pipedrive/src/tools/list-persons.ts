/**
 * list-persons — list persons (contacts) from Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerListPersonsTool(app: AgentApp): void {
  app.tool('list-persons', {
    description:
      'List persons (contacts) from your Pipedrive account. Supports pagination and sorting.',
    parameters: {
      type: 'object',
      properties: {
        start: {
          type: 'number',
          description: 'Pagination start (offset). Default 0.',
        },
        limit: {
          type: 'number',
          description: 'Number of persons to return (1-500, default 100).',
        },
        sort: {
          type: 'string',
          description: 'Field and direction to sort by, e.g. "name ASC".',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const params: Record<string, string | number | boolean | undefined> = {};
      if (args.start !== undefined) params.start = args.start as number;
      if (args.limit) params.limit = args.limit as number;
      if (args.sort) params.sort = args.sort as string;

      return await pipedriveRequest('GET', '/persons', { params }, ctx);
    },
  });
}
