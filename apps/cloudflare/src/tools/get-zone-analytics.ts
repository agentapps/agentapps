/**
 * get_zone_analytics — retrieve analytics dashboard data for a Cloudflare zone.
 */

import type { AgentApp } from '@agentapps/sdk';
import { cloudflareRequest } from '../lib/cloudflare-client.js';

export function registerGetZoneAnalyticsTool(app: AgentApp): void {
  app.tool('get_zone_analytics', {
    description:
      'Get analytics dashboard data for a Cloudflare zone, including requests, bandwidth, threats, and page views over a time range.',
    parameters: {
      type: 'object',
      properties: {
        zoneId: {
          type: 'string',
          description: 'The Cloudflare zone ID.',
        },
        since: {
          type: 'string',
          description:
            'Start of time range as ISO 8601 date string (e.g. 2024-01-01T00:00:00Z) or relative duration (e.g. -1440 for last 24h in minutes).',
        },
        until: {
          type: 'string',
          description: 'End of time range as ISO 8601 date string (e.g. 2024-01-02T00:00:00Z).',
        },
      },
      required: ['zoneId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const zoneId = args.zoneId as string;
      const params: Record<string, unknown> = {};
      if (args.since) params.since = args.since;
      if (args.until) params.until = args.until;

      return await cloudflareRequest(
        'GET',
        `/zones/${zoneId}/analytics/dashboard`,
        { params },
        ctx,
      );
    },
  });
}
