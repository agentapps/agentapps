/**
 * get_retention — get retention data from Amplitude.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_EXPORT_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerGetRetentionTool(app: AgentApp): void {
  app.tool('get_retention', {
    description:
      'Get retention data from Amplitude. Returns retention rates for users who performed a start event and then a return event within a date range.',
    parameters: {
      type: 'object',
      properties: {
        se: {
          type: 'string',
          description: 'Start event definition as a JSON object, e.g. {"event_type":"signup"}.',
        },
        re: {
          type: 'string',
          description: 'Return event definition as a JSON object, e.g. {"event_type":"login"}.',
        },
        start: {
          type: 'string',
          description: 'Start date in YYYYMMDD format (e.g. "20240101").',
        },
        end: {
          type: 'string',
          description: 'End date in YYYYMMDD format (e.g. "20240131").',
        },
        rm: {
          type: 'string',
          description: 'Retention mode: "n-day", "unbounded", or "bracket". Defaults to "n-day".',
        },
      },
      required: ['se', 're', 'start', 'end'],
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
        se: args.se as string,
        re: args.re as string,
        start: args.start as string,
        end: args.end as string,
      };
      if (args.rm) params.rm = args.rm as string;

      return await amplitudeRequest('GET', AMPLITUDE_EXPORT_URL, '/retention', params, ctx);
    },
  });
}
