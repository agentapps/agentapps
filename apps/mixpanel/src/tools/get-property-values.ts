/**
 * get_property_values — get values for an event property from Mixpanel.
 */

import type { AgentApp } from '@agentapps/sdk';
import { MIXPANEL_QUERY_URL, mixpanelRequest } from '../lib/mixpanel-client.js';

export function registerGetPropertyValuesTool(app: AgentApp): void {
  app.tool('get_property_values', {
    description:
      'Get the top values for a specific property of a Mixpanel event. Returns an array of property values.',
    parameters: {
      type: 'object',
      properties: {
        event: {
          type: 'string',
          description: 'The event name that contains the property (e.g. "Purchase").',
        },
        name: {
          type: 'string',
          description: 'The property name to get values for (e.g. "City").',
        },
        type: {
          type: 'string',
          description: 'Analysis type: "general", "unique", or "average". Defaults to "general".',
        },
      },
      required: ['event', 'name'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const params: Record<string, string | number | boolean | undefined | null> = {
        event: args.event as string,
        name: args.name as string,
      };
      if (args.type) params.type = args.type as string;

      return await mixpanelRequest(
        'GET',
        MIXPANEL_QUERY_URL,
        '/events/properties/values',
        params,
        ctx,
      );
    },
  });
}
