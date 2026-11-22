import type { AgentApp } from '@agentapps/sdk';
import { type SentryEvent, sentryRequest } from '../types.js';

export function registerListEventsTool(app: AgentApp): void {
  app.tool('list_events', {
    description: 'List events (individual error occurrences) for an issue.',
    parameters: {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: 'The issue ID to get events for.' },
        limit: { type: 'number', description: 'Max events to return (default: 25).' },
      },
      required: ['issueId'],
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

      let endpoint = `/issues/${args.issueId}/events/`;
      if (args.limit) endpoint += `?limit=${args.limit}`;

      const events = await sentryRequest<SentryEvent[]>(endpoint, apiKey);
      return events.map((e) => ({
        eventID: e.eventID,
        title: e.title,
        message: e.message,
        dateCreated: e.dateCreated,
        user: e.user,
        platform: e.platform,
      }));
    },
  });
}
