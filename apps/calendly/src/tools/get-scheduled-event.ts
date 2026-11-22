import type { AgentApp } from '@agentapps/sdk';
import { calendlyRequest } from '../lib/calendly-client.js';

/**
 * get-scheduled-event — GET /scheduled_events/{eventId}
 *
 * Returns details for a single scheduled event.
 */
export function registerGetScheduledEventTool(app: AgentApp): void {
  app.tool('get-scheduled-event', {
    description:
      'Get a single Calendly scheduled event by UUID (GET /scheduled_events/{eventId}). Returns start/end time, status, event type, location, created/updated timestamps, etc.',
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
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const data = (await calendlyRequest(
        'GET',
        `/scheduled_events/${a.eventId}`,
        undefined,
        ctx,
      )) as { resource: Record<string, unknown> };
      return { event: data.resource };
    },
  });
}
