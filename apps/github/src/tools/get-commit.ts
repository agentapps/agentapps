import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerGetCommitTool(app: AgentApp) {
  app.tool('get-commit', {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description: 'Get details of a specific commit',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        ref: { type: 'string', description: 'Commit SHA' },
      },
      required: ['owner', 'repo', 'ref'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, ref } = args as { owner: string; repo: string; ref: string };
      return await githubRequest(ctx, `/repos/${owner}/${repo}/commits/${ref}`);
    },
  });
}
