import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient } from '../lib/index.js';

/**
 * delete-message — DELETE /me/messages/{messageId} or move to Deleted Items.
 */
export function registerDeleteMessageTool(app: AgentApp): void {
  app.tool('delete-message', {
    description: 'Delete a message (moves to Deleted Items) or permanently delete it.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The ID of the message to delete' },
        permanent: {
          type: 'boolean',
          description:
            'If true, permanently deletes the message. Otherwise moves to Deleted Items (default: false)',
        },
      },
      required: ['messageId'],
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

      const a = args as Record<string, unknown>;
      const messageId = a.messageId as string;
      const permanent = (a.permanent as boolean) || false;

      if (permanent) {
        await graphRequest('DELETE', `/me/messages/${messageId}`);
      } else {
        await graphRequest('POST', `/me/messages/${messageId}/move`, {
          destinationId: 'deleteditems',
        });
      }

      return { success: true, account: email, messageId, permanent };
    },
  });
}
