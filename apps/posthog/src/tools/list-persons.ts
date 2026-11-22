/**
 * list_persons — list persons (users) tracked in PostHog.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerListPersonsTool(app: AgentApp): void {
  app.tool('list_persons', {
    description:
      'List persons (users) tracked in PostHog. Returns person profiles with optional limit.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of persons to return (default 10).',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const limit = (args.limit as number) ?? 10;
      return await posthogRequest('GET', 'persons', { query: { limit } }, ctx);
    },
  });
}
