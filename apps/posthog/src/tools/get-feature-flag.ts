/**
 * get-feature-flag — retrieve a single PostHog feature flag by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerGetFeatureFlagTool(app: AgentApp): void {
  app.tool('get-feature-flag', {
    description: 'Get detailed information about a specific PostHog feature flag by its ID.',
    parameters: {
      type: 'object',
      properties: {
        flagId: {
          type: 'number',
          description: 'The PostHog feature flag ID.',
        },
      },
      required: ['flagId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const flagId = args.flagId as number;
      return await posthogRequest('GET', `feature_flags/${flagId}`, null, ctx);
    },
  });
}
