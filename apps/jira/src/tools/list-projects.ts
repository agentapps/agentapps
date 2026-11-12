/**
 * list_projects — list Jira projects.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerListProjectsTool(app: AgentApp): void {
  app.tool('list_projects', {
    description: 'List projects in your Jira instance. Supports pagination.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of projects to return (default 20).',
        },
        startAt: {
          type: 'number',
          description: 'Index of the first result to return for pagination (default 0).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const maxResults = (args.maxResults as number) || 20;
      const startAt = (args.startAt as number) || 0;

      const response = (await jiraRequest(
        'GET',
        '/project/search',
        {
          params: { maxResults, startAt },
        },
        ctx,
      )) as Record<string, unknown>;

      return {
        projects: response.values,
        total: response.total,
      };
    },
  });
}
