/**
 * create_feature_flag — create a new feature flag in PostHog.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerCreateFeatureFlagTool(app: AgentApp): void {
  app.tool('create_feature_flag', {
    description:
      'Create a new feature flag in PostHog with a key, name, and optional rollout filters.',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'The unique key for the feature flag (e.g. "beta-feature").',
        },
        name: {
          type: 'string',
          description: 'A human-readable name for the feature flag.',
        },
        filters: {
          type: 'object',
          description:
            'Rollout filters for the flag. Example: { "groups": [{ "rollout_percentage": 50 }] }.',
        },
        active: {
          type: 'boolean',
          description: 'Whether the flag is active. Default: true.',
        },
      },
      required: ['key', 'name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = {
        key: args.key as string,
        name: args.name as string,
      };
      if (args.filters !== undefined) body.filters = args.filters;
      if (args.active !== undefined) body.active = args.active as boolean;

      ctx.log('info', `Creating feature flag: ${args.key}`);
      return await posthogRequest('POST', 'feature_flags', { body }, ctx);
    },
  });
}
