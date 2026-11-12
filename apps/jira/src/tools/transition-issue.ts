/**
 * transition_issue — transition a Jira issue to a new status.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerTransitionIssueTool(app: AgentApp): void {
  app.tool('transition_issue', {
    description:
      'Transition a Jira issue to a new status. Use get_transitions first to find the available transition IDs.',
    parameters: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The issue key (e.g. "PROJ-123").',
        },
        transitionId: {
          type: 'string',
          description:
            'The ID of the transition to perform (use get_transitions to find available IDs).',
        },
      },
      required: ['issueKey', 'transitionId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const issueKey = args.issueKey as string;
      const transitionId = args.transitionId as string;

      return await jiraRequest(
        'POST',
        `/issue/${issueKey}/transitions`,
        { body: { transition: { id: transitionId } } },
        ctx,
      );
    },
  });
}
