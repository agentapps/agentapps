import type { AgentApp } from '@agentapps/sdk';
import { calendlyRequest } from '../lib/calendly-client.js';

/**
 * get-invitee — GET /scheduled_events/{eventUuid}/invitees/{inviteeUuid}
 *
 * Returns details for a specific invitee of a scheduled event.
 */
export function registerGetInviteeTool(app: AgentApp): void {
  app.tool('get-invitee', {
    description:
      'Get details of a specific Calendly invitee (GET /scheduled_events/{eventUuid}/invitees/{inviteeUuid}). Returns invitee name, email, status, timezone, questions/answers, tracking info, etc.',
    parameters: {
      type: 'object',
      properties: {
        eventUuid: {
          type: 'string',
          description: 'The scheduled event UUID.',
        },
        inviteeUuid: {
          type: 'string',
          description: 'The invitee UUID.',
        },
      },
      required: ['eventUuid', 'inviteeUuid'],
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
        `/scheduled_events/${a.eventUuid}/invitees/${a.inviteeUuid}`,
        undefined,
        ctx,
      )) as { resource: Record<string, unknown> };
      return { invitee: data.resource };
    },
  });
}
