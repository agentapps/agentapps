import type { AgentApp } from '@agentapps/sdk';
import { type SentryTeam, sentryRequest } from '../types.js';

export function registerListTeamsTool(app: AgentApp): void {
  app.tool('list_teams', {
    description: 'List teams in a Sentry organization.',
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
      if (!org) throw new Error('Organization is required.');

      const teams = await sentryRequest<SentryTeam[]>(`/organizations/${org}/teams/`, apiKey);
      return teams.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        dateCreated: t.dateCreated,
        memberCount: t.memberCount,
      }));
    },
  });
}
