/**
 * get_event — retrieve a single PostHog event by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerGetEventTool(app: AgentApp): void {
  app.tool('get_event', {
    description: 'Get detailed information about a specific PostHog event by its ID.',
    parameters: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: 'The PostHog event ID.',
        },
      },
      required: ['eventId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const eventId = args.eventId as string;
      return await posthogRequest('GET', `events/${eventId}`, null, ctx);
    },
  });
}
