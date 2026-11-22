/**
 * list_projects — list Vercel projects with optional search.
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerListProjectsTool(app: AgentApp): void {
  app.tool('list_projects', {
    description:
      'List projects from your Vercel account. Supports filtering by search term and pagination via limit.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of projects to return (default 20).',
        },
        search: {
          type: 'string',
          description: 'Search projects by name.',
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
      const params: Record<string, unknown> = {
        limit: (args.limit as number) || 20,
      };
      if (args.search) params.search = args.search;

      const data = (await vercelRequest('GET', '/v9/projects', { params }, ctx)) as Record<
        string,
        unknown
      >;
      return { projects: data.projects, pagination: data.pagination };
    },
  });
}
