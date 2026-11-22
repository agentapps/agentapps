import type { AgentApp } from '@agentapps/sdk';
import { type SentryIssue, sentryRequest } from '../types.js';

export function registerListIssuesTool(app: AgentApp): void {
  app.tool('list-issues', {
    description: 'List issues (errors/problems) for a project. Filter by status and search query.',
    parameters: {
      type: 'object',
      properties: {
        organization: {
          type: 'string',
          description: 'Organization slug. Uses configured default if omitted.',
        },
        project: { type: 'string', description: 'Project slug (optional, lists all if omitted).' },
        query: {
          type: 'string',
          description: 'Search query (e.g. "is:unresolved", "level:error").',
        },
        limit: { type: 'number', description: 'Max issues to return (default: 25).' },
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
      const apiKey = await ctx.systemSecret('API_KEY');
      if (!apiKey) throw new Error('Missing API_KEY system secret.');
      const org = (args.organization as string) || (await ctx.systemSecret('ORGANIZATION'));
      if (!org) throw new Error('Organization is required.');

      const params = new URLSearchParams();
      if (args.project) params.append('project', args.project as string);
      if (args.query) params.append('query', args.query as string);
      if (args.limit) params.append('limit', String(args.limit));
      const qs = params.toString();

      const issues = await sentryRequest<SentryIssue[]>(
        `/organizations/${org}/issues/${qs ? `?${qs}` : ''}`,
        apiKey,
      );
      return issues.map((i) => ({
        id: i.id,
        shortId: i.shortId,
        title: i.title,
        culprit: i.culprit,
        level: i.level,
        status: i.status,
        count: i.count,
        userCount: i.userCount,
        firstSeen: i.firstSeen,
        lastSeen: i.lastSeen,
        project: i.project?.slug,
        type: i.type,
      }));
    },
  });
}
