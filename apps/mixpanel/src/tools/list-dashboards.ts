/**
 * list_dashboards — list all dashboards in a Mixpanel project.
 */

import type { AgentApp } from '@agentapps/sdk';
import { MIXPANEL_QUERY_URL, mixpanelRequest } from '../lib/mixpanel-client.js';

export function registerListDashboardsTool(app: AgentApp): void {
  app.tool('list_dashboards', {
    description:
      'List all dashboards in your Mixpanel project. Returns dashboard IDs, names, and metadata.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: { readOnlyHint: true },
    handler: async (_args, ctx) => {
      return await mixpanelRequest('GET', MIXPANEL_QUERY_URL, '/dashboards', null, ctx);
    },
  });
}
