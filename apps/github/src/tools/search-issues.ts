import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerSearchIssuesTool(app: AgentApp) {
  app.tool('search-issues', {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description: 'Search issues and pull requests across GitHub. Use GitHub search syntax in `q`.',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query (GitHub search syntax).' },
        sort: {
          type: 'string',
          enum: ['comments', 'reactions', 'created', 'updated', 'best-match'],
          description: 'Sort field',
        },
        order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' },
        per_page: { type: 'number', description: 'Results per page (default: 30, max: 100)' },
        page: { type: 'number', description: 'Page index (1-based)' },
      },
      required: ['q'],
    },
    handler: async (args, ctx) => {
      const { q, sort, order, per_page, page } = args as {
        q: string;
        sort?: string;
        order?: string;
        per_page?: number;
        page?: number;
      };
      if (!q || q.trim() === '') throw new Error('`q` must be a non-empty search query.');
      return await githubRequest(ctx, '/search/issues', {
        params: {
          q,
          sort: sort && sort !== 'best-match' ? sort : undefined,
          order,
          per_page,
          page,
        },
      });
    },
  });
}
