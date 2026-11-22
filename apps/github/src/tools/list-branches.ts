import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerListBranchesTool(app: AgentApp) {
  app.tool('list-branches', {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description: 'List branches in a repository',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        per_page: { type: 'number', description: 'Results per page (default: 30, max: 100)' },
      },
      required: ['owner', 'repo'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, per_page } = args as { owner: string; repo: string; per_page?: number };
      return await githubRequest(ctx, `/repos/${owner}/${repo}/branches`, { params: { per_page } });
    },
  });
}
