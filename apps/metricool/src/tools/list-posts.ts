import type { AgentApp } from '@agentapps/sdk';
import { type Args, readBrandId, readLocalDateTime, readTimezone } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { capItems } from '../lib/limit.js';
import { type Envelope, type ScheduledPost, summarizePost } from '../lib/posts.js';

export function registerListPostsTool(app: AgentApp): void {
  /** @spec METRICOOL-REQ-4 */
  app.tool('list-posts', {
    description:
      'List the posts in the planner of a brand between two dates: drafts, scheduled and already published. Returns { posts: [{ id, date, timezone, draft, preview, networks: [{ network, status, publicUrl }] }] }. status is PENDING, PUBLISHING, PUBLISHED, AWAITING_CONFIRMATION, ERROR or DRAFT; preview is the first 280 characters (get-post gives the full post). A large answer is cut with limitApplied: true, then narrow the range.',
    parameters: {
      type: 'object',
      properties: {
        brandId: { type: ['number', 'string'], description: 'Brand id, from list-brands.' },
        start: {
          type: 'string',
          description: 'Start of the range, local date-time, e.g. 2026-12-01T00:00:00.',
        },
        end: {
          type: 'string',
          description: 'End of the range, local date-time, e.g. 2026-12-31T23:59:59.',
        },
        timezone: {
          type: 'string',
          description:
            "IANA timezone of the dates, e.g. Europe/Madrid. list-brands gives the brand's.",
        },
      },
      required: ['brandId', 'start', 'end', 'timezone'],
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
      const blogId = readBrandId(a.brandId);
      const start = readLocalDateTime(a.start, 'start');
      const end = readLocalDateTime(a.end, 'end');
      const timezone = readTimezone(a.timezone);
      const answer = await apiRequest<Envelope<ScheduledPost[]>>(
        'GET',
        '/v2/scheduler/posts',
        ctx,
        { params: { blogId, start, end, timezone } },
      );
      const all = (Array.isArray(answer?.data) ? answer.data : []).map(summarizePost);
      const { items, ...limit } = capItems(all, 'posts');
      return { posts: items, ...limit };
    },
  });
}
