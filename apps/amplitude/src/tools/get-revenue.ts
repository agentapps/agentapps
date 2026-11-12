/**
 * get_revenue — get revenue LTV data from Amplitude.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_EXPORT_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerGetRevenueTool(app: AgentApp): void {
  app.tool('get_revenue', {
    description:
      'Get revenue lifetime value (LTV) data from Amplitude. Returns revenue metrics including ARPU, ARPPU, and total revenue within a date range.',
    parameters: {
      type: 'object',
      properties: {
        start: {
          type: 'string',
          description: 'Start date in YYYYMMDD format (e.g. "20240101").',
        },
        end: {
          type: 'string',
          description: 'End date in YYYYMMDD format (e.g. "20240131").',
        },
        m: {
          type: 'string',
          description:
            'Revenue metric: "0" (ARPU), "1" (ARPPU), "2" (total revenue), "3" (paying users). Defaults to "0".',
        },
        i: {
          type: 'string',
          description: 'Interval: "1" (daily), "7" (weekly), "30" (monthly). Defaults to "1".',
        },
      },
      required: ['start', 'end'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const params: Record<string, string | number | boolean | undefined | null> = {
        start: args.start as string,
        end: args.end as string,
      };
      if (args.m) params.m = args.m as string;
      if (args.i) params.i = args.i as string;

      return await amplitudeRequest('GET', AMPLITUDE_EXPORT_URL, '/revenue/ltv', params, ctx);
    },
  });
}
