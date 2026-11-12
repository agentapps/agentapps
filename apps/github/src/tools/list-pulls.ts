import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerListPullsTool(app: AgentApp) {
  app.tool('list-pulls', {
    annotations: { readOnlyHint: true },
    description: 'List pull requests for a repository',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Filter by state (default: open)',
        },
        sort: {
          type: 'string',
          enum: ['created', 'updated', 'popularity', 'long-running'],
          description: 'Sort by',
        },
        per_page: { type: 'number', description: 'Results per page (default: 30, max: 100)' },
      },
      required: ['owner', 'repo'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, state, sort, per_page } = args as {
        owner: string;
        repo: string;
        state?: string;
        sort?: string;
        per_page?: number;
      };
      return await githubRequest(ctx, `/repos/${owner}/${repo}/pulls`, {
        params: { state, sort, per_page },
      });
    },
  });
}
