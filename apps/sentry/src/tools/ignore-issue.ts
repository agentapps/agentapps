import type { AgentApp } from '@agentapps/sdk';
import { type SentryIssue, sentryRequest } from '../types.js';

export function registerIgnoreIssueTool(app: AgentApp): void {
  app.tool('ignore_issue', {
    description: 'Ignore a Sentry issue (stop notifications).',
    parameters: {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: 'The issue ID to ignore.' },
      },
      required: ['issueId'],
    },
    // A status change that Sentry can revert (the issue and its events are kept): not destructive.
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
      ctx.log('info', `Ignoring issue: ${issueId}`);

      const result = await sentryRequest<SentryIssue>(`/issues/${issueId}/`, apiKey, {
        method: 'PUT',
        body: JSON.stringify({ status: 'ignored' }),
      });

      return { ignored: true, id: result.id, status: result.status };
    },
  });
}
