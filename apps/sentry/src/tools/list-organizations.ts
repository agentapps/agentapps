import type { AgentApp } from '@agentapps/sdk';
import { type SentryOrganization, sentryRequest } from '../types.js';

export function registerListOrganizationsTool(app: AgentApp): void {
  app.tool('list_organizations', {
    description: 'List all Sentry organizations the authenticated user has access to.',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const apiKey = await ctx.systemSecret('API_KEY');
      if (!apiKey) throw new Error('Missing API_KEY system secret.');

      const orgs = await sentryRequest<SentryOrganization[]>('/organizations/', apiKey);
      return orgs.map((o) => ({
        slug: o.slug,
        name: o.name,
        id: o.id,
        dateCreated: o.dateCreated,
      }));
    },
  });
}
