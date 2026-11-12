import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerListCommitsTool(app: AgentApp) {
  app.tool('list-commits', {
    annotations: { readOnlyHint: true },
    description: 'List commits in a repository',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        sha: { type: 'string', description: 'SHA or branch name to list commits from' },
        per_page: { type: 'number', description: 'Results per page (default: 30, max: 100)' },
      },
      required: ['owner', 'repo'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, sha, per_page } = args as {
        owner: string;
        repo: string;
        sha?: string;
        per_page?: number;
      };
      return await githubRequest(ctx, `/repos/${owner}/${repo}/commits`, {
        params: { sha, per_page },
      });
    },
  });
}
