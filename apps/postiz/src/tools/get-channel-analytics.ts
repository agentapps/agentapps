import type { AgentApp } from '@agentapps/sdk';
import { type AnalyticsMetric, shapeAnalytics } from '../lib/analytics.js';
import { type Args, readDays, readId } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';

export function registerGetChannelAnalyticsTool(app: AgentApp): void {
  /** @spec POSTIZ-REQ-9 */
  app.tool('get-channel-analytics', {
    description:
      'Read the metrics of a channel (followers, impressions and whatever the network reports) over the last days. Returns { channelId, days, metrics: [{ label, data: [{ date, total }], percentageChange }] }. Max 90 days.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: ['string', 'number'], description: 'Channel id, from list-channels.' },
        days: {
          type: 'integer',
          minimum: 1,
          maximum: 90,
          description: 'Days to look back, 1 to 90 (e.g. 7, 30, 90).',
        },
      },
      required: ['channelId', 'days'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const channelId = readId(a.channelId, 'channelId');
      const days = readDays(a.days);
      const metrics = await apiRequest<AnalyticsMetric[]>('GET', `/analytics/${channelId}`, ctx, {
        params: { date: days },
      });
      return { channelId, days, metrics: shapeAnalytics(metrics) };
    },
  });
}
