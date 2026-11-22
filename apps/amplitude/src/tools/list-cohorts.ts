/**
 * list_cohorts — list all cohorts in an Amplitude project.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_DASHBOARD_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerListCohortsTool(app: AgentApp): void {
  app.tool('list_cohorts', {
    description:
      'List all cohorts in your Amplitude project. Returns cohort IDs, names, descriptions, and sizes.',
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
      return await amplitudeRequest('GET', AMPLITUDE_DASHBOARD_URL, '/cohorts', null, ctx);
    },
  });
}
