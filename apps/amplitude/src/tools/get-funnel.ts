/**
 * get_funnel — get funnel analysis data from Amplitude.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_EXPORT_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerGetFunnelTool(app: AgentApp): void {
  app.tool('get_funnel', {
    description:
      'Get funnel conversion data from Amplitude. Returns step-by-step conversion rates for a sequence of events within a date range.',
    parameters: {
      type: 'object',
      properties: {
        e: {
          type: 'string',
          description:
            'Funnel events as a JSON string. Each event is an object, e.g. {"event_type":"signup"}. Pass multiple e params by encoding them as a JSON array.',
        },
        start: {
          type: 'string',
          description: 'Start date in YYYYMMDD format (e.g. "20240101").',
        },
        end: {
          type: 'string',
          description: 'End date in YYYYMMDD format (e.g. "20240131").',
        },
        mode: {
          type: 'string',
          description: 'Counting mode: "uniques", "totals", or "ordered". Defaults to "uniques".',
        },
        n: {
          type: 'string',
          description: 'Conversion window in days. Defaults to "14".',
        },
      },
      required: ['e', 'start', 'end'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const params: Record<string, string | number | boolean | undefined | null> = {
        e: args.e as string,
        start: args.start as string,
        end: args.end as string,
      };
      if (args.mode) params.mode = args.mode as string;
      if (args.n) params.n = args.n as string;

      return await amplitudeRequest('GET', AMPLITUDE_EXPORT_URL, '/funnels', params, ctx);
    },
  });
}
