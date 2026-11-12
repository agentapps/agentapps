/**
 * list-logs — list recent Zapier NLA execution logs.
 */

import type { AgentApp } from '@agentapps/sdk';
import { zapierRequest } from '../lib/zapier-client.js';

export function registerListLogsTool(app: AgentApp): void {
  app.tool('list-logs', {
    description:
      'List recent Zapier NLA execution logs. Returns a history of executed actions with their statuses and results.',
    parameters: {
      type: 'object',
      properties: {
        offset: {
          type: 'number',
          description: 'Pagination offset (0-based). Default 0.',
        },
        limit: {
          type: 'number',
          description: 'Number of results to return. Default 10.',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const query: Record<string, string | number | boolean | undefined | null> = {};
      if (args.offset !== undefined) query.offset = args.offset as number;
      if (args.limit !== undefined) query.limit = args.limit as number;

      return await zapierRequest('GET', '/execution-log/', { query }, ctx);
    },
  });
}
