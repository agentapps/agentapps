import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerListPrReviewCommentsTool(app: AgentApp) {
  app.tool('list-pr-review-comments', {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description: 'List review comments (inline comments on diff) of a pull request.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pull_number: { type: 'number', description: 'Pull request number' },
        sort: {
          type: 'string',
          enum: ['created', 'updated', 'created_at'],
          description: 'Sort field',
        },
        direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' },
        per_page: { type: 'number', description: 'Results per page (default: 30, max: 100)' },
        page: { type: 'number', description: 'Page index (1-based)' },
      },
      required: ['owner', 'repo', 'pull_number'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, pull_number, sort, direction, per_page, page } = args as {
        owner: string;
        repo: string;
        pull_number: number;
        sort?: string;
        direction?: string;
        per_page?: number;
        page?: number;
      };
      return await githubRequest(ctx, `/repos/${owner}/${repo}/pulls/${pull_number}/comments`, {
        params: { sort, direction, per_page, page },
      });
    },
  });
}
