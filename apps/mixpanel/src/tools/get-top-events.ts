/**
 * get-top-events — get the top events by volume from Mixpanel.
 */

import type { AgentApp } from '@agentapps/sdk';
import { MIXPANEL_QUERY_URL, mixpanelRequest } from '../lib/mixpanel-client.js';

export function registerGetTopEventsTool(app: AgentApp): void {
  app.tool('get-top-events', {
    description:
      'Get the top events by volume from Mixpanel. Returns the most common events in your project.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Analysis type: "general", "unique", or "average". Defaults to "general".',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to return.',
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
      if (args.limit !== undefined) params.limit = args.limit as number;

      return await mixpanelRequest('GET', MIXPANEL_QUERY_URL, '/events/top', params, ctx);
    },
  });
}
