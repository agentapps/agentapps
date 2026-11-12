import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';
export function registerListReleasesTool(app: AgentApp) {
  app.tool('list-releases', {
    annotations: { readOnlyHint: true },
    description: 'List releases of a repository, newest first.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        per_page: { type: 'number' },
        page: { type: 'number' },
      },
      required: ['owner', 'repo'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, per_page, page } = args as {
        owner: string;
        repo: string;
        per_page?: number;
        page?: number;
      };
      return await githubRequest(ctx, `/repos/${owner}/${repo}/releases`, {
        params: { per_page, page },
      });
    },
  });
}
