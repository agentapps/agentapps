/**
 * list_events — list recent events from PostHog.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerListEventsTool(app: AgentApp): void {
  app.tool('list_events', {
    description:
      'List recent events captured by PostHog. Returns the most recent events with optional limit.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of events to return (default 10).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const limit = (args.limit as number) ?? 10;
      return await posthogRequest('GET', 'events', { query: { limit } }, ctx);
    },
  });
}
