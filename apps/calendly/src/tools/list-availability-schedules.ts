import type { AgentApp } from '@agentapps/sdk';
import { calendlyRequest } from '../lib/calendly-client.js';

/**
 * list-availability-schedules — GET /user_availability_schedules
 *
 * Lists availability schedules for the authenticated user.
 */
export function registerListAvailabilitySchedulesTool(app: AgentApp): void {
  app.tool('list-availability-schedules', {
    description:
      'List Calendly availability schedules for a user (GET /user_availability_schedules). Requires userUri. Returns availability rules with days, intervals, timezone, and whether the schedule is the default.',
    parameters: {
      type: 'object',
      properties: {
        userUri: {
          type: 'string',
          description:
            'The Calendly user URI (e.g. "https://api.calendly.com/users/AAAA"). Get this from get-current-user.',
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

      const data = (await calendlyRequest('GET', '/user_availability_schedules', params, ctx)) as {
        collection: unknown[];
      };
      return {
        count: data.collection.length,
        schedules: data.collection,
      };
    },
  });
}
