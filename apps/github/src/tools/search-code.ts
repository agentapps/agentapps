import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';
export function registerSearchCodeTool(app: AgentApp) {
  app.tool('search-code', {
    annotations: { readOnlyHint: true },
    description: 'Search for code across GitHub repositories',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        per_page: { type: 'number', description: 'Results per page' },
      },
      required: ['query'],
    },
    handler: async (args, ctx) => {
      const { query, per_page } = args as { query: string; per_page?: number };
      return await githubRequest(ctx, '/search/code', { params: { q: query, per_page } });
    },
  });
}
