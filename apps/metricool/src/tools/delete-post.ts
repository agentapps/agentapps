import type { AgentApp } from '@agentapps/sdk';
import { type Args, readBrandId, readPositiveInt } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';

export function registerDeletePostTool(app: AgentApp): void {
  /** @spec METRICOOL-REQ-7 */
  app.tool('delete-post', {
    description:
      'Delete a post from the planner of a brand by id: a draft or a scheduled post stops being published. If the post starts a thread, Metricool deletes the whole thread. Returns { success, id }. Get ids with list-posts.',
    parameters: {
      type: 'object',
      properties: {
        brandId: { type: ['number', 'string'], description: 'Brand id, from list-brands.' },
        id: { type: ['number', 'string'], description: 'Post id, from list-posts.' },
      },
      required: ['brandId', 'id'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const blogId = readBrandId(a.brandId);
      const id = readPositiveInt(a.id, 'id');
      await apiRequest('DELETE', `/v2/scheduler/posts/${id}`, ctx, { params: { blogId } });
      return { success: true, id };
    },
  });
}
