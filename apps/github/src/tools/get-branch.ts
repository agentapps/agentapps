import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerGetBranchTool(app: AgentApp) {
  app.tool('get-branch', {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description: 'Get information about a specific branch',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        branch: { type: 'string', description: 'Branch name' },
      },
      required: ['owner', 'repo', 'branch'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, branch } = args as { owner: string; repo: string; branch: string };
      return await githubRequest(ctx, `/repos/${owner}/${repo}/branches/${branch}`);
    },
  });
}
