import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerMergePullTool(app: AgentApp) {
  app.tool('merge-pull', {
    annotations: {
      readOnlyHint: false,
      // A merge writes to the base branch and cannot be undone through the app.
      destructiveHint: true,
      // A pull request already merged cannot be merged again.
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    description: 'Merge a pull request',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pull_number: { type: 'number', description: 'Pull request number' },
        commit_title: { type: 'string', description: 'Title for merge commit (optional)' },
        commit_message: { type: 'string', description: 'Message for merge commit (optional)' },
        merge_method: {
          type: 'string',
          enum: ['merge', 'squash', 'rebase'],
          description: 'Merge method (default: merge)',
        },
      },
      required: ['owner', 'repo', 'pull_number'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, pull_number, commit_title, commit_message, merge_method } = args as {
        owner: string;
        repo: string;
        pull_number: number;
        commit_title?: string;
        commit_message?: string;
        merge_method?: string;
      };
      return await githubRequest(ctx, `/repos/${owner}/${repo}/pulls/${pull_number}/merge`, {
        method: 'PUT',
        body: { commit_title, commit_message, merge_method: merge_method ?? 'merge' },
      });
    },
  });
}
