/**
 * get-sprint — get details of a specific sprint.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerGetSprintTool(app: AgentApp): void {
  app.tool('get-sprint', {
    description:
      'Get detailed information about a specific sprint by its ID, including name, state, and dates.',
    parameters: {
      type: 'object',
      properties: {
        sprintId: {
          type: 'number',
          description: 'The ID of the sprint.',
        },
      },
      required: ['sprintId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const sprintId = args.sprintId as number;

      return await jiraRequest(
        'GET',
        `/sprint/${sprintId}`,
        {
          basePath: '/rest/agile/1.0',
        },
        ctx,
      );
    },
  });
}
