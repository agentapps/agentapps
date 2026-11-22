/**
 * list-notes — list notes from Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerListNotesTool(app: AgentApp): void {
  app.tool('list-notes', {
    description:
      'List notes from your Pipedrive account. Supports filtering by associated entity and pagination.',
    parameters: {
      type: 'object',
      properties: {
        deal_id: {
          type: 'number',
          description: 'Filter notes by associated deal ID.',
        },
        person_id: {
          type: 'number',
          description: 'Filter notes by associated person ID.',
        },
        org_id: {
          type: 'number',
          description: 'Filter notes by associated organization ID.',
        },
        start: {
          type: 'number',
          description: 'Pagination start (offset). Default 0.',
        },
        limit: {
          type: 'number',
          description: 'Number of notes to return (1-500, default 100).',
        },
        sort: {
          type: 'string',
          description: 'Field and direction to sort by, e.g. "add_time DESC".',
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
      if (args.deal_id) params.deal_id = args.deal_id as number;
      if (args.person_id) params.person_id = args.person_id as number;
      if (args.org_id) params.org_id = args.org_id as number;
      if (args.start !== undefined) params.start = args.start as number;
      if (args.limit) params.limit = args.limit as number;
      if (args.sort) params.sort = args.sort as string;

      return await pipedriveRequest('GET', '/notes', { params }, ctx);
    },
  });
}
