/**
 * search_logs — search Datadog logs.
 */

import type { AgentApp } from '@agentapps/sdk';
import { datadogRequest } from '../lib/datadog-client.js';

export function registerSearchLogsTool(app: AgentApp): void {
  app.tool('search_logs', {
    description:
      'Search log events in Datadog. Supports query filtering, time range, pagination, and sorting.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The log search query (e.g. "service:web status:error").',
        },
        from: {
          type: 'string',
          description: 'Start of the time range (ISO 8601 or relative, e.g. "now-1h").',
        },
        to: {
          type: 'string',
          description: 'End of the time range (ISO 8601 or relative, e.g. "now").',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of log events to return (default 10, max 1000).',
        },
        sort: {
          type: 'string',
          description: 'Sort order for results: "timestamp" (asc) or "-timestamp" (desc, default).',
        },
      },
      required: ['query'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = {
        filter: {
          query: args.query as string,
          ...(args.from ? { from: args.from as string } : {}),
          ...(args.to ? { to: args.to as string } : {}),
        },
        page: {
          limit: (args.limit as number) || 10,
        },
        sort: (args.sort as string) || '-timestamp',
      };

      return await datadogRequest('POST', '/api/v2/logs/events/search', { body }, ctx);
    },
  });
}
