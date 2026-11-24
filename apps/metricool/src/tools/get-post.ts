import type { AgentApp } from '@agentapps/sdk';
import { type Args, readBrandId, readPositiveInt } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { describePost, type Envelope, type ScheduledPost } from '../lib/posts.js';

export function registerGetPostTool(app: AgentApp): void {
  /** @spec METRICOOL-REQ-5 */
  app.tool('get-post', {
    description:
      'Get one post of the planner by id. Returns { id, date, timezone, draft, text, firstComment, media, networks: [{ network, status, publicUrl }], networkData }. media is a list of URLs; networkData holds the per-network options that are set (instagramData, linkedinData, ...). Get ids with list-posts.',
    parameters: {
      type: 'object',
      properties: {
        brandId: { type: ['number', 'string'], description: 'Brand id, from list-brands.' },
        id: { type: ['number', 'string'], description: 'Post id, from list-posts.' },
      },
      required: ['brandId', 'id'],
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
      const id = readPositiveInt(a.id, 'id');
      const answer = await apiRequest<Envelope<ScheduledPost>>(
        'GET',
        `/v2/scheduler/posts/${id}`,
        ctx,
        { params: { blogId } },
      );
      return describePost(answer?.data ?? {});
    },
  });
}
