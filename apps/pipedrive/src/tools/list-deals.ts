/**
 * list-deals — list deals from Pipedrive with optional filtering and pagination.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerListDealsTool(app: AgentApp): void {
  app.tool('list-deals', {
    description:
      'List deals from your Pipedrive account. Supports filtering by status, stage, user, and cursor-based pagination.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description:
            'Filter by deal status: open, won, lost, deleted, all_not_deleted (default: all_not_deleted).',
          enum: ['open', 'won', 'lost', 'deleted', 'all_not_deleted'],
        },
        stage_id: {
          type: 'number',
          description: 'Filter by pipeline stage ID.',
        },
        user_id: {
          type: 'number',
          description: 'Filter by owner user ID.',
        },
        start: {
          type: 'number',
          description: 'Pagination start (offset). Default 0.',
        },
        limit: {
          type: 'number',
          description: 'Number of deals to return (1-500, default 100).',
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
      if (args.status) params.status = args.status as string;
      if (args.stage_id) params.stage_id = args.stage_id as number;
      if (args.user_id) params.user_id = args.user_id as number;
      if (args.start !== undefined) params.start = args.start as number;
      if (args.limit) params.limit = args.limit as number;
      if (args.sort) params.sort = args.sort as string;

      return await pipedriveRequest('GET', '/deals', { params }, ctx);
    },
  });
}
