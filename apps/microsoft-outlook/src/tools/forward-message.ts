import type { AgentApp } from '@agentapps/sdk';
import { buildRecipients, createGraphClient } from '../lib/index.js';

/**
 * forward-message — POST /me/messages/{messageId}/forward.
 */
export function registerForwardMessageTool(app: AgentApp): void {
  app.tool('forward-message', {
    description: 'Forward an email message to other recipients.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The ID of the message to forward' },
        to: { type: 'string', description: 'Recipient email address(es), comma-separated' },
        comment: {
          type: 'string',
          description: 'Optional comment to include with the forwarded message',
        },
      },
      required: ['messageId', 'to'],
    },
    // Sends an email to other people: it cannot be unsent.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = args as Record<string, unknown>;
      const messageId = a.messageId as string;

      await graphRequest('POST', `/me/messages/${messageId}/forward`, {
        comment: (a.comment as string) || '',
        toRecipients: buildRecipients(a.to as string),
      });

      return { success: true, account: email, forwardedTo: a.to as string };
    },
  });
}
