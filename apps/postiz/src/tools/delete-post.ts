import type { AgentApp } from '@agentapps/sdk';
import { type Args, readId } from '../lib/args.js';
import { ApiError, apiRequest } from '../lib/client.js';

export function registerDeletePostTool(app: AgentApp): void {
  /** @spec POSTIZ-REQ-7 */
  app.tool('delete-post', {
    description:
      'Delete a post from Postiz by id (a draft or a scheduled post stops being published). Returns { success, id }, with alreadyDeleted: true when the post no longer existed. Get ids with list-posts.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: ['string', 'number'], description: 'Post id, from list-posts.' },
      },
      required: ['id'],
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
      const id = readId(a.id, 'id');
      try {
        await apiRequest('DELETE', `/posts/${id}`, ctx);
      } catch (err) {
        // Postiz answers 404 for a post that is already gone.
        if (err instanceof ApiError && err.status === 404) {
          return { success: true, id, alreadyDeleted: true };
        }
        throw err;
      }
      return { success: true, id };
    },
  });
}
