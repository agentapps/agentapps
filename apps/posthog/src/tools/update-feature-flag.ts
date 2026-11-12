/**
 * update_feature_flag — update an existing feature flag in PostHog.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerUpdateFeatureFlagTool(app: AgentApp): void {
  app.tool('update_feature_flag', {
    description:
      'Update an existing feature flag in PostHog by its ID. Supports partial updates (PATCH).',
    parameters: {
      type: 'object',
      properties: {
        flagId: {
          type: 'number',
          description: 'The PostHog feature flag ID.',
        },
        key: {
          type: 'string',
          description: 'New key for the feature flag.',
        },
        name: {
          type: 'string',
          description: 'New human-readable name for the feature flag.',
        },
        filters: {
          type: 'object',
          description: 'Updated rollout filters for the flag.',
        },
        active: {
          type: 'boolean',
          description: 'Whether the flag is active.',
        },
      },
      required: ['flagId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const flagId = args.flagId as number;
      const body: Record<string, unknown> = {};
      if (args.key !== undefined) body.key = args.key as string;
      if (args.name !== undefined) body.name = args.name as string;
      if (args.filters !== undefined) body.filters = args.filters;
      if (args.active !== undefined) body.active = args.active as boolean;

      ctx.log('info', `Updating feature flag ${flagId}`);
      return await posthogRequest('PATCH', `feature_flags/${flagId}`, { body }, ctx);
    },
  });
}
