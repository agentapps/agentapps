import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';
import { findAttachments, findTextPart } from '../lib/helpers.js';

/**
 * get-message — Get full details of a specific email message by ID.
 */
export function registerGetMessageTool(app: AgentApp): void {
  app.tool('get-message', {
    description: 'Get full details of a specific email message by ID.',
    parameters: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description: 'The ID of the message to retrieve',
        },
      },
      required: ['messageId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const secrets = await getSecrets(ctx);
      const { gmail, email } = await createGmailClient(secrets);

      const messageId = (args as Record<string, unknown>).messageId as string;
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const message = response.data;
      const headers = message.payload?.headers || [];
      const body = findTextPart(message.payload);
      const attachments = findAttachments(message.payload);

      return {
        account: email,
        id: message.id,
        threadId: message.threadId,
        from: headers.find((h: any) => h.name === 'From')?.value,
        to: headers.find((h: any) => h.name === 'To')?.value,
        subject: headers.find((h: any) => h.name === 'Subject')?.value,
        date: headers.find((h: any) => h.name === 'Date')?.value,
        body,
        attachments,
        labelIds: message.labelIds,
      };
    },
  });
}
