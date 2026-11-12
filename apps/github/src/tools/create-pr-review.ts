import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerCreatePrReviewTool(app: AgentApp) {
  app.tool('create-pr-review', {
    annotations: { readOnlyHint: false },
    description:
      'Create a pull request review. `event` controls the verdict: APPROVE / REQUEST_CHANGES / COMMENT.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pull_number: { type: 'number', description: 'Pull request number' },
        event: {
          type: 'string',
          enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'],
          description: 'Verdict of the review',
        },
        body: { type: 'string', description: 'Review body (markdown).' },
        commit_id: { type: 'string', description: 'SHA of the commit the review applies to' },
        comments: {
          type: 'array',
          description: 'Inline comments. Each item: {path, position OR line, body}.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              position: { type: 'number' },
              line: { type: 'number' },
              body: { type: 'string' },
            },
            required: ['path', 'body'],
          },
        },
      },
      required: ['owner', 'repo', 'pull_number', 'event'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, pull_number, event, body, commit_id, comments } = args as {
        owner: string;
        repo: string;
        pull_number: number;
        event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
        body?: string;
        commit_id?: string;
        comments?: Array<{ path: string; position?: number; line?: number; body: string }>;
      };
      if ((event === 'REQUEST_CHANGES' || event === 'COMMENT') && (!body || body.trim() === '')) {
        throw new Error(`\`body\` is required when event is ${event}.`);
      }
      return await githubRequest(ctx, `/repos/${owner}/${repo}/pulls/${pull_number}/reviews`, {
        method: 'POST',
        body: { event, body, commit_id, comments },
      });
    },
  });
}
