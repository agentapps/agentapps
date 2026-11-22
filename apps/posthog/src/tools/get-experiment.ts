/**
 * get-experiment — retrieve a single PostHog experiment by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerGetExperimentTool(app: AgentApp): void {
  app.tool('get-experiment', {
    description:
      'Get detailed information about a specific PostHog experiment (A/B test) by its ID.',
    parameters: {
      type: 'object',
      properties: {
        experimentId: {
          type: 'number',
          description: 'The PostHog experiment ID.',
        },
      },
      required: ['experimentId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const experimentId = args.experimentId as number;
      return await posthogRequest('GET', `experiments/${experimentId}`, null, ctx);
    },
  });
}
