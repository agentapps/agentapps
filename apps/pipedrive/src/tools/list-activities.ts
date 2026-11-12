/**
 * list-activities — list activities from Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerListActivitiesTool(app: AgentApp): void {
  app.tool('list-activities', {
    description:
      'List activities from your Pipedrive account. Supports filtering by type, user, and pagination.',
    parameters: {
      type: 'object',
      properties: {
        user_id: {
          type: 'number',
          description: 'Filter by owner user ID.',
        },
        type: {
          type: 'string',
          description:
            'Filter by activity type (e.g. call, meeting, task, deadline, email, lunch).',
        },
        done: {
          type: 'number',
          description: 'Filter by completion: 0 for undone, 1 for done.',
          enum: [0, 1],
        },
        start: {
          type: 'number',
          description: 'Pagination start (offset). Default 0.',
        },
        limit: {
          type: 'number',
          description: 'Number of activities to return (1-500, default 100).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const params: Record<string, string | number | boolean | undefined> = {};
      if (args.user_id) params.user_id = args.user_id as number;
      if (args.type) params.type = args.type as string;
      if (args.done !== undefined) params.done = args.done as number;
      if (args.start !== undefined) params.start = args.start as number;
      if (args.limit) params.limit = args.limit as number;

      return await pipedriveRequest('GET', '/activities', { params }, ctx);
    },
  });
}
