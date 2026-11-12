import type { AgentApp } from '@agentapps/sdk';
import { calendlyRequest } from '../lib/calendly-client.js';

/**
 * get-event-type — GET /event_types/{eventTypeId}
 *
 * Returns details for a single event type.
 */
export function registerGetEventTypeTool(app: AgentApp): void {
  app.tool('get-event-type', {
    description:
      'Get a single Calendly event type by UUID (GET /event_types/{eventTypeId}). Returns name, slug, duration, scheduling URL, description, color, etc.',
    parameters: {
      type: 'object',
      properties: {
        eventTypeId: {
          type: 'string',
          description: 'The event type UUID.',
        },
      },
      required: ['eventTypeId'],
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
        `/event_types/${a.eventTypeId}`,
        undefined,
        ctx,
      )) as { resource: Record<string, unknown> };
      return { eventType: data.resource };
    },
  });
}
