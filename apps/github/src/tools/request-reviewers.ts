import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';

export function registerRequestReviewersTool(app: AgentApp) {
  app.tool('request-reviewers', {
    annotations: { readOnlyHint: false },
    description: 'Request reviewers on a pull request.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        pull_number: { type: 'number', description: 'Pull request number' },
        reviewers: {
          type: 'array',
          items: { type: 'string' },
          description: 'GitHub usernames to request review from',
        },
        team_reviewers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Team slugs to request review from',
        },
      },
      required: ['owner', 'repo', 'pull_number'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, pull_number, reviewers, team_reviewers } = args as {
        owner: string;
        repo: string;
        pull_number: number;
        reviewers?: string[];
        team_reviewers?: string[];
      };
      const hasUsers = Array.isArray(reviewers) && reviewers.length > 0;
      const hasTeams = Array.isArray(team_reviewers) && team_reviewers.length > 0;
      if (!hasUsers && !hasTeams)
        throw new Error('At least one of `reviewers` or `team_reviewers` must contain a value.');
      return await githubRequest(
        ctx,
        `/repos/${owner}/${repo}/pulls/${pull_number}/requested_reviewers`,
        {
          method: 'POST',
          body: {
            reviewers: hasUsers ? reviewers : undefined,
            team_reviewers: hasTeams ? team_reviewers : undefined,
          },
        },
      );
    },
  });
}
