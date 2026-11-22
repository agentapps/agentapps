/**
 * list-cohorts — list all saved cohorts in a Mixpanel project.
 */

import type { AgentApp } from '@agentapps/sdk';
import { MIXPANEL_QUERY_URL, mixpanelRequest } from '../lib/mixpanel-client.js';

export function registerListCohortsTool(app: AgentApp): void {
  app.tool('list-cohorts', {
    description:
      'List all saved cohorts in your Mixpanel project. Returns cohort IDs, names, and descriptions.',
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
      return await mixpanelRequest('GET', MIXPANEL_QUERY_URL, '/cohorts/list', null, ctx);
    },
  });
}
