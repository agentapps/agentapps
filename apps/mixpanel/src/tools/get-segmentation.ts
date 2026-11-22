/**
 * get-segmentation — get segmentation data from Mixpanel.
 */

import type { AgentApp } from '@agentapps/sdk';
import { MIXPANEL_QUERY_URL, mixpanelRequest } from '../lib/mixpanel-client.js';

export function registerGetSegmentationTool(app: AgentApp): void {
  app.tool('get-segmentation', {
    description:
      'Get segmentation (event breakdown) data from Mixpanel. Returns event counts segmented by a property within a date range.',
    parameters: {
      type: 'object',
      properties: {
        event: {
          type: 'string',
          description: 'The event name to segment (e.g. "Purchase").',
        },
        from_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format.',
        },
        to_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format.',
        },
        on: {
          type: 'string',
          description: 'Property expression to segment by (e.g. \'properties["City"]\').',
        },
        unit: {
          type: 'string',
          description: 'Time unit: "hour", "day", "week", or "month". Defaults to "day".',
        },
        type: {
          type: 'string',
          description: 'Analysis type: "general", "unique", or "average". Defaults to "general".',
        },
      },
      required: ['event', 'from_date', 'to_date'],
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
        event: args.event as string,
        from_date: args.from_date as string,
        to_date: args.to_date as string,
      };
      if (args.on) params.on = args.on as string;
      if (args.unit) params.unit = args.unit as string;
      if (args.type) params.type = args.type as string;

      return await mixpanelRequest('GET', MIXPANEL_QUERY_URL, '/segmentation', params, ctx);
    },
  });
}
