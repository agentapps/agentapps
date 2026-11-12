import type { AgentApp } from '@agentapps/sdk';
import { type SentryIssue, sentryRequest } from '../types.js';

export function registerGetIssueTool(app: AgentApp): void {
  app.tool('get_issue', {
    description: 'Get detailed information about a specific Sentry issue.',
    parameters: {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: 'The issue ID.' },
      },
      required: ['issueId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const apiKey = await ctx.systemSecret('API_KEY');
      if (!apiKey) throw new Error('Missing API_KEY system secret.');

      const issue = await sentryRequest<SentryIssue>(`/issues/${args.issueId}/`, apiKey);
      return {
        id: issue.id,
        shortId: issue.shortId,
        title: issue.title,
        culprit: issue.culprit,
        level: issue.level,
        status: issue.status,
        count: issue.count,
        userCount: issue.userCount,
        firstSeen: issue.firstSeen,
        lastSeen: issue.lastSeen,
        project: issue.project,
        metadata: issue.metadata,
        assignedTo: issue.assignedTo,
        permalink: issue.permalink,
      };
    },
  });
}
