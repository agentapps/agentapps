import type { AgentApp } from '@agentapps/sdk';
import { type AnalyticsMetric, shapeAnalytics } from '../lib/analytics.js';
import { type Args, readDays, readId } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';

export function registerGetPostAnalyticsTool(app: AgentApp): void {
  /** @spec POSTIZ-REQ-9 */
  app.tool('get-post-analytics', {
    description:
      'Read the metrics of one published post (likes, comments and whatever the network reports) over the last days. Returns { postId, days, metrics: [{ label, data: [{ date, total }], percentageChange }] }. Max 90 days. Get post ids with list-posts.',
    parameters: {
      type: 'object',
      properties: {
        postId: { type: ['string', 'number'], description: 'Post id, from list-posts.' },
        days: {
          type: 'integer',
          minimum: 1,
          maximum: 90,
          description: 'Days to look back, 1 to 90 (e.g. 7, 30, 90).',
        },
      },
      required: ['postId', 'days'],
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
      const postId = readId(a.postId, 'postId');
      const days = readDays(a.days);
      const metrics = await apiRequest<AnalyticsMetric[]>('GET', `/analytics/post/${postId}`, ctx, {
        params: { date: days },
      });
      return { postId, days, metrics: shapeAnalytics(metrics) };
    },
  });
}
