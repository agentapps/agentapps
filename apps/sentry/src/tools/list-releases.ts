import type { AgentApp } from '@agentapps/sdk';
import { type SentryRelease, sentryRequest } from '../types.js';

export function registerListReleasesTool(app: AgentApp): void {
  app.tool('list_releases', {
    description: 'List releases for a Sentry organization.',
    parameters: {
      type: 'object',
      properties: {
        organization: {
          type: 'string',
          description: 'Organization slug. Uses configured default if omitted.',
        },
        project: { type: 'string', description: 'Filter by project slug (optional).' },
        limit: { type: 'number', description: 'Max releases to return (default: 25).' },
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
      if (args.limit) params.append('per_page', String(args.limit));
      const qs = params.toString();

      const releases = await sentryRequest<SentryRelease[]>(
        `/organizations/${org}/releases/${qs ? `?${qs}` : ''}`,
        apiKey,
      );
      return releases.map((r) => ({
        version: r.version,
        shortVersion: r.shortVersion,
        status: r.status,
        dateCreated: r.dateCreated,
        dateReleased: r.dateReleased,
        newGroups: r.newGroups,
        projects: r.projects?.map((p) => p.slug),
      }));
    },
  });
}
