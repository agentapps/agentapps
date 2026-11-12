/**
 * list_funnels — list all saved funnels in a Mixpanel project.
 */

import type { AgentApp } from '@agentapps/sdk';
import { MIXPANEL_QUERY_URL, mixpanelRequest } from '../lib/mixpanel-client.js';

export function registerListFunnelsTool(app: AgentApp): void {
  app.tool('list_funnels', {
    description: 'List all saved funnels in your Mixpanel project. Returns funnel IDs and names.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: { readOnlyHint: true },
    handler: async (_args, ctx) => {
      return await mixpanelRequest('GET', MIXPANEL_QUERY_URL, '/funnels/list', null, ctx);
    },
  });
}
