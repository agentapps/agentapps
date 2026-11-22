/**
 * export_events — export raw event data from Mixpanel.
 */

import type { AgentApp } from '@agentapps/sdk';
import { MIXPANEL_EXPORT_URL, mixpanelRequest } from '../lib/mixpanel-client.js';

export function registerExportEventsTool(app: AgentApp): void {
  app.tool('export_events', {
    description:
      'Export raw event data from Mixpanel within a date range. Returns individual events with all properties. Use for detailed event-level analysis.',
    parameters: {
      type: 'object',
      properties: {
        from_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format.',
        },
        to_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format.',
        },
        event: {
          type: 'string',
          description: 'Optional event name filter. Only export events with this name.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to return.',
        },
      },
      required: ['from_date', 'to_date'],
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
        from_date: args.from_date as string,
        to_date: args.to_date as string,
      };
      if (args.event) params.event = JSON.stringify([args.event as string]);
      if (args.limit !== undefined) params.limit = args.limit as number;

      return await mixpanelRequest('GET', MIXPANEL_EXPORT_URL, '/export', params, ctx);
    },
  });
}
