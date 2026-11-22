/**
 * list-feature-flags — list feature flags configured in PostHog.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerListFeatureFlagsTool(app: AgentApp): void {
  app.tool('list-feature-flags', {
    description:
      'List all feature flags configured in the PostHog project, including their status and rollout settings.',
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
      return await posthogRequest('GET', 'feature_flags', null, ctx);
    },
  });
}
