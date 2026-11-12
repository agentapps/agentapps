import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerGetIssueTool(app: AgentApp) {
  app.tool('get-issue', {
    annotations: { readOnlyHint: true },
    description: 'Get details of a specific issue',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        issue_number: { type: 'number', description: 'Issue number' },
      },
      required: ['owner', 'repo', 'issue_number'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, issue_number } = args as {
        owner: string;
        repo: string;
        issue_number: number;
      };
      return await githubRequest(ctx, `/repos/${owner}/${repo}/issues/${issue_number}`);
    },
  });
}
