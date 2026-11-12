import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';
import { createRawEmail, processEmailBody } from '../lib/helpers.js';

/**
 * reply-message — Reply to an existing email message.
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
      },
      required: ['messageId', 'body'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const secrets = await getSecrets(ctx);
      const { gmail, email, displayName } = await createGmailClient(secrets);

      const a = (args ?? {}) as Record<string, unknown>;
      const messageId = a.messageId as string;
      const original = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Message-ID', 'References'],
      });

      const headers = original.data.payload?.headers || [];
      const originalFrom = headers.find((h: any) => h.name === 'From')?.value || '';
      const originalTo = headers.find((h: any) => h.name === 'To')?.value || '';
      const originalSubject = headers.find((h: any) => h.name === 'Subject')?.value || '';
      const messageIdHeader = headers.find((h: any) => h.name === 'Message-ID')?.value || '';
      const referencesHeader = headers.find((h: any) => h.name === 'References')?.value || '';

      const replyTo = originalFrom.includes(email) ? originalTo : originalFrom;
      const subject = originalSubject.startsWith('Re:')
        ? originalSubject
        : `Re: ${originalSubject}`;
      const references = referencesHeader
        ? `${referencesHeader} ${messageIdHeader}`
        : messageIdHeader;

      // Process body: auto-convert Markdown to HTML if detected
      const { body: processedBody, isHtml } = await processEmailBody(
        a.body as string,
        a.isHtml as boolean | undefined,
      );

      const rawEmail = createRawEmail(replyTo, subject, processedBody, email, {
        isHtml,
        inReplyTo: messageIdHeader,
        references,
        fromName: displayName,
      });

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: rawEmail,
          threadId: original.data.threadId,
        },
      });

      return {
        success: true,
        account: email,
        messageId: response.data.id,
        threadId: response.data.threadId,
        htmlConverted: isHtml && !(a.isHtml as boolean),
      };
    },
  });
}
