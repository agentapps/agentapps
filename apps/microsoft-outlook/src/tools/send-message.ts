import type { AgentApp } from '@agentapps/sdk';
import {
  buildFileAttachment,
  buildRecipients,
  createGraphClient,
  processEmailBody,
} from '../lib/index.js';

/**
 * send-message — POST /me/sendMail.
 */
export function registerSendMessageTool(app: AgentApp): void {
  app.tool('send-message', {
    description: 'Send an email message from the connected Outlook account.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address(es), comma-separated' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body (plain text, Markdown, or HTML)' },
        cc: { type: 'string', description: 'CC recipients (comma-separated)' },
        bcc: { type: 'string', description: 'BCC recipients (comma-separated)' },
        isHtml: {
          type: 'boolean',
          description: 'Whether body is HTML (default: false, auto-detects Markdown)',
        },
        importance: {
          type: 'string',
          description: 'Message importance: low, normal, high (default: normal)',
        },
        attachments: {
          type: 'array',
          description: 'Array of file attachments to include',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Local file path' },
              filename: { type: 'string', description: 'Optional custom filename' },
            },
            required: ['path'],
          },
        },
      },
      required: ['to', 'subject', 'body'],
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

      const a = args as Record<string, unknown>;
      const { body: processedBody, isHtml } = await processEmailBody(
        a.body as string,
        a.isHtml as boolean | undefined,
      );

      const message: any = {
        subject: a.subject as string,
        body: {
          contentType: isHtml ? 'HTML' : 'Text',
          content: processedBody,
        },
        toRecipients: buildRecipients(a.to as string),
      };

      if (a.cc) message.ccRecipients = buildRecipients(a.cc as string);
      if (a.bcc) message.bccRecipients = buildRecipients(a.bcc as string);
      if (a.importance) message.importance = a.importance as string;

      const attachmentArgs = a.attachments as
        | Array<{ path: string; filename?: string }>
        | undefined;
      if (attachmentArgs && attachmentArgs.length > 0) {
        message.attachments = attachmentArgs.map(buildFileAttachment);
      }

      await graphRequest('POST', '/me/sendMail', { message, saveToSentItems: true });

      return {
        success: true,
        account: email,
        htmlConverted: isHtml && !(a.isHtml as boolean),
      };
    },
  });
}
