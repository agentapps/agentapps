/**
 * list_sprints — list sprints for a Jira agile board.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerListSprintsTool(app: AgentApp): void {
  app.tool('list_sprints', {
    description:
      'List sprints for a given agile board. Use list_boards to find board IDs. Supports filtering by sprint state.',
    parameters: {
      type: 'object',
      properties: {
        boardId: {
          type: 'number',
          description: 'The ID of the board to list sprints for.',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of sprints to return (default 50).',
        },
        startAt: {
          type: 'number',
          description: 'Index of the first result to return for pagination (default 0).',
        },
        state: {
          type: 'string',
          description:
            'Filter by sprint state: "future", "active", or "closed". Comma-separate for multiple.',
        },
      },
      required: ['boardId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const boardId = args.boardId as number;
      const params: Record<string, string | number | undefined> = {};
      params.maxResults = (args.maxResults as number) || 50;
      params.startAt = (args.startAt as number) || 0;
      if (args.state) params.state = args.state as string;

      const response = (await jiraRequest(
        'GET',
        `/board/${boardId}/sprint`,
        {
          params,
          basePath: '/rest/agile/1.0',
        },
        ctx,
      )) as Record<string, unknown>;

      return {
        sprints: response.values,
        total: response.total,
        startAt: response.startAt,
        maxResults: response.maxResults,
        isLast: response.isLast,
      };
    },
  });
}
