import type { AgentApp } from '@agentapps/sdk';
import { calendlyRequest } from '../lib/calendly-client.js';

/**
 * list-event-types — GET /event_types
 *
 * Lists the authenticated user's event types (e.g. "30 Minute Meeting").
 */
export function registerListEventTypesTool(app: AgentApp): void {
  app.tool('list-event-types', {
    description:
      "List Calendly event types for a user (GET /event_types). Requires userUri (the user's Calendly URI). Optional: count (number of results, default 20). Returns event types with name, slug, duration, scheduling URL, etc.",
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
      },
      required: ['userUri'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const params: Record<string, string | number | boolean | undefined> = {
        user: String(a.userUri),
      };
      if (a.count !== undefined) params.count = Number(a.count);

      const data = (await calendlyRequest('GET', '/event_types', params, ctx)) as {
        collection: unknown[];
        pagination: unknown;
      };
      return {
        count: data.collection.length,
        eventTypes: data.collection,
        pagination: data.pagination,
      };
    },
  });
}
