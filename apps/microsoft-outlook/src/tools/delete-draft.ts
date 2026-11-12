import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient } from '../lib/index.js';

/**
 * delete-draft — DELETE /me/messages/{draftId}.
 */
export function registerDeleteDraftTool(app: AgentApp): void {
  app.tool('delete-draft', {
    description: 'Delete a draft email.',
    parameters: {
      type: 'object',
      properties: {
        draftId: { type: 'string', description: 'The ID of the draft to delete' },
      },
      required: ['draftId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const draftId = (args as Record<string, unknown>).draftId as string;
      await graphRequest('DELETE', `/me/messages/${draftId}`);

      return { success: true, account: email, draftId };
    },
  });
}
