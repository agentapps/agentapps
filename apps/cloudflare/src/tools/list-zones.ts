/**
 * list_zones — list Cloudflare zones with optional filtering.
 */

import type { AgentApp } from '@agentapps/sdk';
import { cloudflareRequest } from '../lib/cloudflare-client.js';

export function registerListZonesTool(app: AgentApp): void {
  app.tool('list_zones', {
    description:
      'List zones in your Cloudflare account. Supports filtering by domain name and pagination.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Filter zones by domain name (e.g. example.com).',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default 1).',
        },
        perPage: {
          type: 'number',
          description: 'Number of zones per page (1-50, default 20).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {};
      if (args.name) params.name = args.name;
      if (args.page) params.page = args.page;
      if (args.perPage) params.per_page = args.perPage;

      return await cloudflareRequest('GET', '/zones', { params }, ctx);
    },
  });
}
