import type { AgentApp } from '@agentapps/sdk';
import { type SentryProject, sentryRequest } from '../types.js';

export function registerListProjectsTool(app: AgentApp): void {
  app.tool('list_projects', {
    description: 'List all projects in a Sentry organization.',
    parameters: {
      type: 'object',
      properties: {
        organization: {
          type: 'string',
          description: 'Organization slug. Uses configured default if omitted.',
        },
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
      if (!org)
        throw new Error(
          'Organization is required — pass it as a parameter or configure ORGANIZATION secret.',
        );

      const projects = await sentryRequest<SentryProject[]>(
        `/organizations/${org}/projects/`,
        apiKey,
      );
      return projects.map((p) => ({
        slug: p.slug,
        name: p.name,
        id: p.id,
        platform: p.platform,
        dateCreated: p.dateCreated,
        firstEvent: p.firstEvent,
      }));
    },
  });
}
