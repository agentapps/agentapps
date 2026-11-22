import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient } from '../lib/index.js';

/**
 * move-message — POST /me/messages/{messageId}/move.
 */
export function registerMoveMessageTool(app: AgentApp): void {
  app.tool('move-message', {
    description: 'Move a message to a different mail folder.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The ID of the message to move' },
        destinationFolderId: {
          type: 'string',
          description:
            'Destination folder ID or well-known name (e.g., "Inbox", "Archive", "DeletedItems", "JunkEmail")',
        },
      },
      required: ['messageId', 'destinationFolderId'],
    },
    // Moving the message back undoes it.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = args as Record<string, unknown>;
      const messageId = a.messageId as string;
      const destinationId = a.destinationFolderId as string;

      const moved = await graphRequest('POST', `/me/messages/${messageId}/move`, {
        destinationId,
      });

      return {
        success: true,
        account: email,
        messageId: moved.id,
        destinationFolderId: destinationId,
      };
    },
  });
}
