/**
 * export_events — export raw event data from Amplitude.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_EXPORT_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerExportEventsTool(app: AgentApp): void {
  app.tool('export_events', {
    description:
      'Export raw event data from Amplitude for a given date range. Returns event-level data including user IDs, event properties, and timestamps.',
    parameters: {
      type: 'object',
      properties: {
        start: {
          type: 'string',
          description: 'Start date and hour in YYYYMMDDTHH format (e.g. "20240101T00").',
        },
        end: {
          type: 'string',
          description: 'End date and hour in YYYYMMDDTHH format (e.g. "20240131T23").',
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

      return await amplitudeRequest('GET', AMPLITUDE_EXPORT_URL, '/export', params, ctx);
    },
  });
}
