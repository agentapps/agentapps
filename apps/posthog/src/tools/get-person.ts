/**
 * get_person — retrieve a single PostHog person by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerGetPersonTool(app: AgentApp): void {
  app.tool('get_person', {
    description: 'Get detailed information about a specific PostHog person by their ID.',
    parameters: {
      type: 'object',
      properties: {
        personId: {
          type: 'string',
          description: 'The PostHog person ID.',
        },
      },
      required: ['personId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const personId = args.personId as string;
      return await posthogRequest('GET', `persons/${personId}`, null, ctx);
    },
  });
}
