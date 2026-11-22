import type { AgentApp } from '@agentapps/sdk';
import { type SentryRelease, sentryRequest } from '../types.js';

export function registerCreateReleaseTool(app: AgentApp): void {
  app.tool('create_release', {
    description: 'Create a new release in a Sentry organization.',
    parameters: {
      type: 'object',
      properties: {
        organization: {
          type: 'string',
          description: 'Organization slug. Uses configured default if omitted.',
        },
        version: {
          type: 'string',
          description: 'Release version identifier (e.g. "1.0.0", commit SHA).',
        },
        ref: { type: 'string', description: 'Git commit SHA or ref (optional).' },
        projects: {
          type: 'array',
          items: { type: 'string' },
          description: 'Project slugs to associate with this release.',
        },
      },
      required: ['version', 'projects'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const apiKey = await ctx.systemSecret('API_KEY');
      if (!apiKey) throw new Error('Missing API_KEY system secret.');
      const org = (args.organization as string) || (await ctx.systemSecret('ORGANIZATION'));
      if (!org) throw new Error('Organization is required.');

      const payload: Record<string, unknown> = {
        version: args.version,
        projects: args.projects,
      };
      if (args.ref) payload.ref = args.ref;

      ctx.log('info', `Creating release ${args.version as string} for org ${org}`);

      const r = await sentryRequest<SentryRelease>(`/organizations/${org}/releases/`, apiKey, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return {
        created: true,
        version: r.version,
        shortVersion: r.shortVersion,
        dateCreated: r.dateCreated,
        projects: r.projects?.map((p) => p.slug),
      };
    },
  });
}
