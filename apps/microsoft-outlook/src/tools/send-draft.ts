import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient } from '../lib/index.js';

/**
 * send-draft — POST /me/messages/{draftId}/send.
 */
export function registerSendDraftTool(app: AgentApp): void {
  app.tool('send-draft', {
    description: 'Send an existing draft email.',
    parameters: {
      type: 'object',
      properties: {
        draftId: { type: 'string', description: 'The ID of the draft to send' },
      },
      required: ['draftId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const draftId = (args as Record<string, unknown>).draftId as string;
      await graphRequest('POST', `/me/messages/${draftId}/send`);

      return { success: true, account: email, draftId };
    },
  });
}
