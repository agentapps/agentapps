import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, processEmailBody } from '../lib/index.js';

/**
 * reply-message — POST /me/messages/{messageId}/reply or /replyAll.
 */
export function registerReplyMessageTool(app: AgentApp): void {
  app.tool('reply-message', {
    description: 'Reply to an existing email message.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The ID of the message to reply to' },
        body: { type: 'string', description: 'Reply body' },
        isHtml: { type: 'boolean', description: 'Whether body is HTML (default: false)' },
        replyAll: {
          type: 'boolean',
          description: 'Whether to reply to all recipients (default: false)',
        },
      },
      required: ['messageId', 'body'],
    },
    // Sends an email (to everyone on the thread with replyAll): it cannot be unsent.
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = args as Record<string, unknown>;
      const messageId = a.messageId as string;
      const replyAll = (a.replyAll as boolean) || false;

      const { body: processedBody, isHtml } = await processEmailBody(
        a.body as string,
        a.isHtml as boolean | undefined,
      );

      const endpoint = replyAll
        ? `/me/messages/${messageId}/replyAll`
        : `/me/messages/${messageId}/reply`;

      await graphRequest('POST', endpoint, { comment: processedBody });

      return {
        success: true,
        account: email,
        replyAll,
        htmlConverted: isHtml && !(a.isHtml as boolean),
      };
    },
  });
}
