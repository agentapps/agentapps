import type { AgentApp } from '@agentapps/sdk';
import { calendlyRequest } from '../lib/calendly-client.js';

/**
 * list-scheduled-events — GET /scheduled_events
 *
 * Lists scheduled events (meetings) for the authenticated user.
 */
export function registerListScheduledEventsTool(app: AgentApp): void {
  app.tool('list-scheduled-events', {
    description:
      'List Calendly scheduled events (meetings) for a user (GET /scheduled_events). Requires userUri. Optional: count (default 20), status ("active" or "canceled"). Returns events with start/end times, event type, location, invitees counter, etc.',
    parameters: {
      type: 'object',
      properties: {
        userUri: {
          type: 'string',
          description:
            'The Calendly user URI (e.g. "https://api.calendly.com/users/AAAA"). Get this from get-current-user.',
        },
        count: {
          type: 'number',
          description: 'Number of results to return (default 20, max 100).',
        },
        status: {
          type: 'string',
          description: 'Filter by status: "active" or "canceled" (optional).',
          enum: ['active', 'canceled'],
        },
      },
      required: ['userUri'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const params: Record<string, string | number | boolean | undefined> = {
        user: String(a.userUri),
      };
      if (a.count !== undefined) params.count = Number(a.count);
      if (a.status) params.status = String(a.status);

      const data = (await calendlyRequest('GET', '/scheduled_events', params, ctx)) as {
        collection: unknown[];
        pagination: unknown;
      };
      return {
        count: data.collection.length,
        events: data.collection,
        pagination: data.pagination,
      };
    },
  });
}
