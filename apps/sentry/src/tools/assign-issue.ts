import type { AgentApp } from '@agentapps/sdk';
import { type SentryIssue, sentryRequest } from '../types.js';

export function registerAssignIssueTool(app: AgentApp): void {
  app.tool('assign-issue', {
    description: 'Assign a Sentry issue to a user or team.',
    parameters: {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: 'The issue ID to assign.' },
        assignedTo: {
          type: 'string',
          description: 'User email, username, or "team:<slug>" to assign the issue to.',
        },
      },
      required: ['issueId', 'assignedTo'],
    },
    // Sets the assignee; assigning again to someone else undoes it.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const apiKey = await ctx.systemSecret('API_KEY');
      if (!apiKey) throw new Error('Missing API_KEY system secret.');

      const issueId = args.issueId as string;
      const assignedTo = args.assignedTo as string;
      ctx.log('info', `Assigning issue ${issueId} to ${assignedTo}`);

      const result = await sentryRequest<SentryIssue>(`/issues/${issueId}/`, apiKey, {
        method: 'PUT',
        body: JSON.stringify({ assignedTo }),
      });

      return { assigned: true, id: result.id, assignedTo: result.assignedTo };
    },
  });
}
