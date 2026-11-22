import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerGetRepoTool(app: AgentApp) {
  app.tool('get-repo', {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description: 'Get detailed information about a specific repository',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
      },
      required: ['owner', 'repo'],
    },
    handler: async (args, ctx) => {
      const { owner, repo } = args as { owner: string; repo: string };
      return await githubRequest(ctx, `/repos/${owner}/${repo}`);
    },
  });
}
