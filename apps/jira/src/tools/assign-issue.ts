/**
 * assign-issue — assign a Jira issue to a user.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerAssignIssueTool(app: AgentApp): void {
  app.tool('assign-issue', {
    description:
      'Assign a Jira issue to a user by account ID. Pass null as accountId to unassign the issue.',
    parameters: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The issue key (e.g. "PROJ-123").',
        },
        accountId: {
          type: 'string',
          description:
            'The account ID of the user to assign. Use search-users to find account IDs. Pass "-1" for automatic assignee, or null to unassign.',
        },
      },
      required: ['issueKey', 'accountId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const issueKey = args.issueKey as string;
      const accountId = args.accountId as string | null;

      return await jiraRequest('PUT', `/issue/${issueKey}/assignee`, { body: { accountId } }, ctx);
    },
  });
}
