/**
 * get-transitions — get available transitions for a Jira issue.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerGetTransitionsTool(app: AgentApp): void {
  app.tool('get-transitions', {
    description:
      'Get the available workflow transitions for a Jira issue. Returns transition IDs and names that can be used with transition-issue.',
    parameters: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The issue key (e.g. "PROJ-123").',
        },
      },
      required: ['issueKey'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const issueKey = args.issueKey as string;

      const response = (await jiraRequest(
        'GET',
        `/issue/${issueKey}/transitions`,
        null,
        ctx,
      )) as Record<string, unknown>;

      return response.transitions;
    },
  });
}
