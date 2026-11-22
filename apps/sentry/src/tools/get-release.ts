import type { AgentApp } from '@agentapps/sdk';
import { type SentryRelease, sentryRequest } from '../types.js';

export function registerGetReleaseTool(app: AgentApp): void {
  app.tool('get_release', {
    description: 'Get detailed information about a specific release.',
    parameters: {
      type: 'object',
      properties: {
        organization: {
          type: 'string',
          description: 'Organization slug. Uses configured default if omitted.',
        },
        version: { type: 'string', description: 'Release version identifier.' },
      },
      required: ['version'],
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

      const version = encodeURIComponent(args.version as string);
      const r = await sentryRequest<SentryRelease>(
        `/organizations/${org}/releases/${version}/`,
        apiKey,
      );
      return {
        version: r.version,
        shortVersion: r.shortVersion,
        status: r.status,
        ref: r.ref,
        url: r.url,
        dateCreated: r.dateCreated,
        dateReleased: r.dateReleased,
        newGroups: r.newGroups,
        projects: r.projects?.map((p) => p.slug),
        firstEvent: r.firstEvent,
        lastEvent: r.lastEvent,
      };
    },
  });
}
