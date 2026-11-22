import type { AgentApp } from '@agentapps/sdk';
import { type SentryProject, sentryRequest } from '../types.js';

export function registerGetProjectTool(app: AgentApp): void {
  app.tool('get-project', {
    description: 'Get detailed information about a specific Sentry project.',
    parameters: {
      type: 'object',
      properties: {
        organization: {
          type: 'string',
          description: 'Organization slug. Uses configured default if omitted.',
        },
        project: { type: 'string', description: 'Project slug.' },
      },
      required: ['project'],
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

      const project = args.project as string;
      const p = await sentryRequest<SentryProject>(`/projects/${org}/${project}/`, apiKey);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        platform: p.platform,
        dateCreated: p.dateCreated,
        firstEvent: p.firstEvent,
        hasAccess: p.hasAccess,
      };
    },
  });
}
