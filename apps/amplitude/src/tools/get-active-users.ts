/**
 * get_active_users — get active/new user counts from Amplitude.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_EXPORT_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerGetActiveUsersTool(app: AgentApp): void {
  app.tool('get_active_users', {
    description:
      'Get active or new user counts from Amplitude within a date range. Returns daily/weekly/monthly active user metrics.',
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
            'Active users metric: "active" (active users) or "new" (new users). Defaults to "active".',
        },
        i: {
          type: 'string',
          description: 'Interval: "1" (daily), "7" (weekly), "30" (monthly). Defaults to "1".',
        },
      },
      required: ['start', 'end'],
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
        start: args.start as string,
        end: args.end as string,
      };
      if (args.m) params.m = args.m as string;
      if (args.i) params.i = args.i as string;

      return await amplitudeRequest('GET', AMPLITUDE_EXPORT_URL, '/users', params, ctx);
    },
  });
}
