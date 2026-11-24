import type { AgentApp } from '@agentapps/sdk';
import { type Args, readIsoDate } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';

/** Results stay under the SDK's 50,000-character limit. */
export const MAX_RESULT_CHARS = 45_000;
const PREVIEW_CHARS = 280;

interface Post {
  id: string;
  content?: string;
  publishDate?: string;
  releaseURL?: string;
  state?: string;
  integration?: { id?: string; providerIdentifier?: string; name?: string };
}

export function registerListPostsTool(app: AgentApp): void {
  /** @spec POSTIZ-REQ-5 */
  app.tool('list-posts', {
    description:
      'List the posts in a date range: drafts, scheduled, published and failed. Returns { posts: [{ id, channel: { id, name, provider }, status, publishDate, preview, releaseUrl }] }. status is QUEUE, PUBLISHED, ERROR or DRAFT; preview is the first 280 characters; releaseUrl is set once published. Postiz has no pagination here: a large answer is cut with limitApplied: true, then narrow the range.',
    parameters: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'Start of the range, ISO 8601, e.g. 2026-12-01T00:00:00Z.',
        },
        endDate: {
          type: 'string',
          description: 'End of the range, ISO 8601, e.g. 2026-12-31T23:59:59Z.',
        },
      },
      required: ['startDate', 'endDate'],
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
      const startDate = readIsoDate(a.startDate, 'startDate');
      const endDate = readIsoDate(a.endDate, 'endDate');
      const answer = await apiRequest<{ posts?: Post[] }>('GET', '/posts', ctx, {
        params: { startDate, endDate },
      });
      const all = Array.isArray(answer?.posts) ? answer.posts : [];
      const posts: unknown[] = [];
      let size = 0;
      for (const post of all) {
        const item = {
          id: post.id,
          channel: {
            id: post.integration?.id ?? '',
            name: post.integration?.name ?? '',
            provider: post.integration?.providerIdentifier ?? '',
          },
          status: post.state ?? '',
          publishDate: post.publishDate ?? null,
          preview: (post.content ?? '').slice(0, PREVIEW_CHARS),
          releaseUrl: post.releaseURL || null,
        };
        size += JSON.stringify(item).length + 1;
        if (size > MAX_RESULT_CHARS) {
          return {
            posts,
            limitApplied: true,
            message: `Showing ${posts.length} of ${all.length} posts. Narrow the date range (startDate, endDate) to see the rest.`,
          };
        }
        posts.push(item);
      }
      return { posts };
    },
  });
}
