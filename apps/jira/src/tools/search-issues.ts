/**
 * search_issues — search Jira issues using JQL.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerSearchIssuesTool(app: AgentApp): void {
  app.tool('search_issues', {
    description:
      'Search for Jira issues using JQL (Jira Query Language). Supports pagination and field selection.',
    parameters: {
      type: 'object',
      properties: {
        jql: {
          type: 'string',
          description: 'JQL query string (e.g. "project = PROJ AND status = Open").',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of issues to return (default 20).',
        },
        startAt: {
          type: 'number',
          description: 'Index of the first result to return for pagination (default 0).',
        },
        fields: {
          type: 'string',
          description:
            'Comma-separated list of field names to include (default "summary,status,assignee,priority,created,updated").',
        },
      },
      required: ['jql'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const jql = args.jql as string;
      const maxResults = (args.maxResults as number) || 20;
      const startAt = (args.startAt as number) || 0;
      const fields = (args.fields as string) || 'summary,status,assignee,priority,created,updated';

      const response = (await jiraRequest(
        'GET',
        '/search',
        {
          params: { jql, maxResults, startAt, fields },
        },
        ctx,
      )) as Record<string, unknown>;

      return {
        issues: response.issues,
        total: response.total,
        startAt: response.startAt,
        maxResults: response.maxResults,
      };
    },
  });
}
