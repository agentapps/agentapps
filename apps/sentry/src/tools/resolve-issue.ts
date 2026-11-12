import type { AgentApp } from '@agentapps/sdk';
import { type SentryIssue, sentryRequest } from '../types.js';

export function registerResolveIssueTool(app: AgentApp): void {
  app.tool('resolve_issue', {
    description: 'Mark a Sentry issue as resolved.',
    parameters: {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: 'The issue ID to resolve.' },
      },
      required: ['issueId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const apiKey = await ctx.systemSecret('API_KEY');
      if (!apiKey) throw new Error('Missing API_KEY system secret.');

      const issueId = args.issueId as string;
      ctx.log('info', `Resolving issue: ${issueId}`);

      const result = await sentryRequest<SentryIssue>(`/issues/${issueId}/`, apiKey, {
        method: 'PUT',
        body: JSON.stringify({ status: 'resolved' }),
      });

      return { resolved: true, id: result.id, status: result.status };
    },
  });
}
