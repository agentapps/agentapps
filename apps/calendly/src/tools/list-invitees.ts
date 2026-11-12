import type { AgentApp } from '@agentapps/sdk';
import { calendlyRequest } from '../lib/calendly-client.js';

/**
 * list-invitees — GET /scheduled_events/{eventId}/invitees
 *
 * Lists invitees for a specific scheduled event.
 */
export function registerListInviteesTool(app: AgentApp): void {
  app.tool('list-invitees', {
    description:
      'List invitees for a Calendly scheduled event (GET /scheduled_events/{eventId}/invitees). Returns invitee name, email, status, timezone, questions/answers, etc.',
    parameters: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: 'The scheduled event UUID.',
        },
      },
      required: ['eventId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const data = (await calendlyRequest(
        'GET',
        `/scheduled_events/${a.eventId}/invitees`,
        undefined,
        ctx,
      )) as { collection: unknown[]; pagination: unknown };
      return {
        count: data.collection.length,
        invitees: data.collection,
        pagination: data.pagination,
      };
    },
  });
}
