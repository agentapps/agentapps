import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerListIssuesTool(app: AgentApp) {
  app.tool('list-issues', {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description: 'List issues for a repository with optional filters',
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
        labels: { type: 'string', description: 'Comma-separated list of label names' },
        sort: {
          type: 'string',
          enum: ['created', 'updated', 'comments'],
          description: 'Sort by (default: created)',
        },
        per_page: { type: 'number', description: 'Results per page (default: 30, max: 100)' },
      },
      required: ['owner', 'repo'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, state, labels, sort, per_page } = args as {
        owner: string;
        repo: string;
        state?: string;
        labels?: string;
        sort?: string;
        per_page?: number;
      };
      return await githubRequest(ctx, `/repos/${owner}/${repo}/issues`, {
        params: { state, labels, sort, per_page },
      });
    },
  });
}
