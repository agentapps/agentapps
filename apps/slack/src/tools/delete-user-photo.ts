import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { wrapSlackMutation } from './utils.js';

export function registerDeleteUserPhotoTool(app: AgentApp): void {
  app.tool('delete-user-photo', {
    description:
      "Delete the authenticated user's profile photo (replaces with default avatar). Returns { deleted: true }. Not retryable. No params.",
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (_args, ctx) => {
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() => (client as any).users.deletePhoto());
      return { deleted: true };
    },
  });
}
