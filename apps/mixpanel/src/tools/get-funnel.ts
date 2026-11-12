/**
 * get_funnel — get funnel data from Mixpanel.
 */

import type { AgentApp } from '@agentapps/sdk';
import { MIXPANEL_QUERY_URL, mixpanelRequest } from '../lib/mixpanel-client.js';

export function registerGetFunnelTool(app: AgentApp): void {
  app.tool('get_funnel', {
    description:
      'Get funnel conversion data from Mixpanel for a specific funnel. Returns step-by-step conversion rates within a date range.',
    parameters: {
      type: 'object',
      properties: {
        funnel_id: {
          type: 'number',
          description: 'The ID of the funnel to query.',
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
          description: 'Time unit for grouping: "day", "week", or "month". Defaults to "day".',
        },
      },
      required: ['funnel_id', 'from_date', 'to_date'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const params: Record<string, string | number | boolean | undefined | null> = {
        from_date: args.from_date as string,
        to_date: args.to_date as string,
      };
      if (args.unit) params.unit = args.unit as string;

      return await mixpanelRequest(
        'GET',
        MIXPANEL_QUERY_URL,
        `/funnels/${args.funnel_id as number}`,
        params,
        ctx,
      );
    },
  });
}
