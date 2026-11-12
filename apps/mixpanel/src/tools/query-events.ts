/**
 * query_events — query event data from Mixpanel.
 */

import type { AgentApp } from '@agentapps/sdk';
import { MIXPANEL_QUERY_URL, mixpanelRequest } from '../lib/mixpanel-client.js';

export function registerQueryEventsTool(app: AgentApp): void {
  app.tool('query_events', {
    description:
      'Query event data from Mixpanel. Returns event counts and properties for the specified event within a date range.',
    parameters: {
      type: 'object',
      properties: {
        event: {
          type: 'string',
          description: 'The event name to query (e.g. "Signup", "Purchase").',
        },
        from_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format.',
        },
        to_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format.',
        },
        unit: {
          type: 'string',
          description:
            'Time unit for grouping results: "hour", "day", "week", or "month". Defaults to "day".',
        },
      },
      required: ['event', 'from_date', 'to_date'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      return await mixpanelRequest(
        'GET',
        MIXPANEL_QUERY_URL,
        '/events',
        {
          event: JSON.stringify([args.event as string]),
          from_date: args.from_date as string,
          to_date: args.to_date as string,
          unit: (args.unit as string) ?? 'day',
        },
        ctx,
      );
    },
  });
}
