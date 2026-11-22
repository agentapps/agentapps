/**
 * list_cohorts — list cohorts defined in PostHog.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerListCohortsTool(app: AgentApp): void {
  app.tool('list_cohorts', {
    description: 'List all cohorts (user segments) defined in the PostHog project.',
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
      return await posthogRequest('GET', 'cohorts', null, ctx);
    },
  });
}
