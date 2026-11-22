import type { AgentApp } from '@agentapps/sdk';
import { calendlyRequest } from '../lib/calendly-client.js';

/**
 * cancel-event — POST /scheduled_events/{eventId}/cancellation
 *
 * Cancels a scheduled event with an optional reason.
 */
export function registerCancelEventTool(app: AgentApp): void {
  app.tool('cancel-event', {
    description:
      'Cancel a Calendly scheduled event (POST /scheduled_events/{eventId}/cancellation). Provide an optional cancellation reason. This action cannot be undone.',
    parameters: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: 'The scheduled event UUID to cancel.',
        },
        reason: {
          type: 'string',
          description: 'Cancellation reason (optional, visible to invitees).',
        },
      },
      required: ['eventId'],
    },
    // Destructive: the invitees are told and the app cannot reinstate the event. Idempotent:
    // an event is cancelled once; a repeat is rejected.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const body: Record<string, string | number | boolean | undefined> = {};
      if (a.reason) body.reason = String(a.reason);

      const data = await calendlyRequest(
        'POST',
        `/scheduled_events/${a.eventId}/cancellation`,
        body,
        ctx,
      );
      return { eventId: a.eventId, canceled: true, result: data };
    },
  });
}
