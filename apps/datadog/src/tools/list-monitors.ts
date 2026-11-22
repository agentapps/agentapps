/**
 * list-monitors — list Datadog monitors with optional filtering.
 */

import type { AgentApp } from '@agentapps/sdk';
import { datadogRequest } from '../lib/datadog-client.js';

export function registerListMonitorsTool(app: AgentApp): void {
  app.tool('list-monitors', {
    description:
      'List monitors from your Datadog account. Supports filtering by name and tags, with pagination.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Filter monitors by name (substring match).',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated list of tags to filter monitors by.',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (0-based).',
        },
        pageSize: {
          type: 'number',
          description: 'Number of monitors per page (default 100).',
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
      const query: Record<string, string | number | boolean | undefined | null> = {};
      if (args.name) query.name = args.name as string;
      if (args.tags) query.tags = args.tags as string;
      if (args.page !== undefined) query.page = args.page as number;
      if (args.pageSize !== undefined) query.page_size = args.pageSize as number;

      return await datadogRequest('GET', '/api/v1/monitor', { query }, ctx);
    },
  });
}
