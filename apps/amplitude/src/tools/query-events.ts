/**
 * query_events — query event segmentation data from Amplitude.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_EXPORT_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerQueryEventsTool(app: AgentApp): void {
  app.tool('query_events', {
    description:
      'Query event segmentation data from Amplitude. Returns event counts and breakdowns within a date range.',
    parameters: {
      type: 'object',
      properties: {
        e: {
          type: 'string',
          description:
            'Event definition as a JSON object, e.g. {"event_type":"signup"}. See Amplitude segmentation docs for full spec.',
        },
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
          description: 'Metric: "uniques", "totals", "avg", etc. Defaults to "uniques".',
        },
        i: {
          type: 'string',
          description: 'Interval: "1" (daily), "7" (weekly), "30" (monthly). Defaults to "1".',
        },
      },
      required: ['e', 'start', 'end'],
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
        e: args.e as string,
        start: args.start as string,
        end: args.end as string,
      };
      if (args.m) params.m = args.m as string;
      if (args.i) params.i = args.i as string;

      return await amplitudeRequest(
        'GET',
        AMPLITUDE_EXPORT_URL,
        '/events/segmentation',
        params,
        ctx,
      );
    },
  });
}
