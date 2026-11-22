/**
 * list_boards — list Jira agile boards.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerListBoardsTool(app: AgentApp): void {
  app.tool('list_boards', {
    description:
      'List agile boards in your Jira instance (Scrum and Kanban). Supports pagination and filtering by project or name.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of boards to return (default 50).',
        },
        startAt: {
          type: 'number',
          description: 'Index of the first result to return for pagination (default 0).',
        },
        projectKeyOrId: {
          type: 'string',
          description: 'Filter boards by project key or ID.',
        },
        name: {
          type: 'string',
          description: 'Filter boards whose name contains this string.',
        },
        type: {
          type: 'string',
          description: 'Filter by board type: "scrum", "kanban", or "simple".',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const params: Record<string, string | number | undefined> = {};
      params.maxResults = (args.maxResults as number) || 50;
      params.startAt = (args.startAt as number) || 0;
      if (args.projectKeyOrId) params.projectKeyOrId = args.projectKeyOrId as string;
      if (args.name) params.name = args.name as string;
      if (args.type) params.type = args.type as string;

      const response = (await jiraRequest(
        'GET',
        '/board',
        {
          params,
          basePath: '/rest/agile/1.0',
        },
        ctx,
      )) as Record<string, unknown>;

      return {
        boards: response.values,
        total: response.total,
        startAt: response.startAt,
        maxResults: response.maxResults,
        isLast: response.isLast,
      };
    },
  });
}
