import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerListPrFilesTool(app: AgentApp) {
  app.tool('list-pr-files', {
    annotations: { readOnlyHint: true },
    description: 'List files changed in a pull request.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pull_number: { type: 'number', description: 'Pull request number' },
        per_page: { type: 'number', description: 'Results per page (default: 30, max: 100)' },
        page: { type: 'number', description: 'Page index (1-based)' },
      },
      required: ['owner', 'repo', 'pull_number'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, pull_number, per_page, page } = args as {
        owner: string;
        repo: string;
        pull_number: number;
        per_page?: number;
        page?: number;
      };
      return await githubRequest(ctx, `/repos/${owner}/${repo}/pulls/${pull_number}/files`, {
        params: { per_page, page },
      });
    },
  });
}
