/**
 * list_actions — list actions defined in PostHog.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerListActionsTool(app: AgentApp): void {
  app.tool('list_actions', {
    description:
      'List all actions defined in the PostHog project. Actions are named collections of events.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      return await posthogRequest('GET', 'actions', null, ctx);
    },
  });
}
