import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerGetPullTool(app: AgentApp) {
  app.tool('get-pull', {
    annotations: { readOnlyHint: true },
    description: 'Get details of a specific pull request',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pull_number: { type: 'number', description: 'Pull request number' },
      },
      required: ['owner', 'repo', 'pull_number'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, pull_number } = args as {
        owner: string;
        repo: string;
        pull_number: number;
      };
      return await githubRequest(ctx, `/repos/${owner}/${repo}/pulls/${pull_number}`);
    },
  });
}
