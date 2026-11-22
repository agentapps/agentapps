/**
 * get-event-names — list all tracked event names in a Mixpanel project.
 */

import type { AgentApp } from '@agentapps/sdk';
import { MIXPANEL_QUERY_URL, mixpanelRequest } from '../lib/mixpanel-client.js';

export function registerGetEventNamesTool(app: AgentApp): void {
  app.tool('get-event-names', {
    description:
      'List all tracked event names in your Mixpanel project. Returns an array of event name strings.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Analysis type: "general", "unique", or "average". Defaults to "general".',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const params: Record<string, string | number | boolean | undefined | null> = {};
      if (args.type) params.type = args.type as string;

      return await mixpanelRequest('GET', MIXPANEL_QUERY_URL, '/events/names', params, ctx);
    },
  });
}
