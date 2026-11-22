/**
 * get_retention — get retention data from Mixpanel.
 */

import type { AgentApp } from '@agentapps/sdk';
import { MIXPANEL_QUERY_URL, mixpanelRequest } from '../lib/mixpanel-client.js';

export function registerGetRetentionTool(app: AgentApp): void {
  app.tool('get_retention', {
    description:
      'Get retention data from Mixpanel. Returns cohort retention rates within a date range.',
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
        retention_type: {
          type: 'string',
          description:
            'Type of retention: "birth" (first-time users) or "compounded". Defaults to "birth".',
        },
        born_event: {
          type: 'string',
          description: 'The event that defines the birth cohort (e.g. "Signup").',
        },
        event: {
          type: 'string',
          description: 'The return event to measure retention against.',
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
      if (args.retention_type) params.retention_type = args.retention_type as string;
      if (args.born_event) params.born_event = args.born_event as string;
      if (args.event) params.event = args.event as string;

      return await mixpanelRequest('GET', MIXPANEL_QUERY_URL, '/retention', params, ctx);
    },
  });
}
