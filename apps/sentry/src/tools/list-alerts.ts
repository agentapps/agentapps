import type { AgentApp } from '@agentapps/sdk';
import { type SentryAlertRule, sentryRequest } from '../types.js';

export function registerListAlertsTool(app: AgentApp): void {
  app.tool('list_alerts', {
    description: 'List alert rules for a Sentry project.',
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
      if (!org) throw new Error('Organization is required.');

      const project = args.project as string;
      const rules = await sentryRequest<SentryAlertRule[]>(
        `/projects/${org}/${project}/rules/`,
        apiKey,
      );
      return rules.map((r) => ({
        id: r.id,
        name: r.name,
        environment: r.environment,
        actionMatch: r.actionMatch,
        frequency: r.frequency,
        dateCreated: r.dateCreated,
        status: r.status,
      }));
    },
  });
}
