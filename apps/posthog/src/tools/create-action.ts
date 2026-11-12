/**
 * create_action — create a new action in PostHog.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerCreateActionTool(app: AgentApp): void {
  app.tool('create_action', {
    description:
      'Create a new action in PostHog. Actions group one or more event-matching steps under a single name.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the action (e.g. "User signed up").',
        },
        steps: {
          type: 'array',
          description:
            'Array of step objects defining which events match this action. Example: [{ "event": "$pageview", "url": "/signup" }].',
          items: { type: 'object' },
        },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = {
        name: args.name as string,
      };
      if (args.steps !== undefined) body.steps = args.steps;

      ctx.log('info', `Creating action: ${args.name}`);
      return await posthogRequest('POST', 'actions', { body }, ctx);
    },
  });
}
