import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';

/**
 * modify-labels — Add or remove labels from a message.
 */
export function registerModifyLabelsTool(app: AgentApp): void {
  app.tool('modify-labels', {
    description: 'Add or remove labels from a message (e.g., mark as read/unread, archive, star).',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The ID of the message to modify' },
        addLabelIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to add',
        },
        removeLabelIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to remove',
        },
      },
      required: ['messageId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const secrets = await getSecrets(ctx);
      const { gmail, email } = await createGmailClient(secrets);

      const a = (args ?? {}) as Record<string, unknown>;
      const messageId = a.messageId as string;
      const addLabelIds = (a.addLabelIds as string[]) || [];
      const removeLabelIds = (a.removeLabelIds as string[]) || [];

      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { addLabelIds, removeLabelIds },
      });

      return {
        success: true,
        account: email,
        messageId,
        addedLabels: addLabelIds,
        removedLabels: removeLabelIds,
      };
    },
  });
}
