/**
 * search-users — search for Jira users by name or email.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerSearchUsersTool(app: AgentApp): void {
  app.tool('search-users', {
    description:
      'Search for Jira users by display name or email address. Useful for finding account IDs to use with assign-issue or create-issue.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search string to match against user display names and email addresses.',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of users to return (default 20).',
        },
        startAt: {
          type: 'number',
          description: 'Index of the first result to return for pagination (default 0).',
        },
      },
      required: ['query'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const query = args.query as string;
      const maxResults = (args.maxResults as number) || 20;
      const startAt = (args.startAt as number) || 0;

      return await jiraRequest(
        'GET',
        '/user/search',
        {
          params: { query, maxResults, startAt },
        },
        ctx,
      );
    },
  });
}
