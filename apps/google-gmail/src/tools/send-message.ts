import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';
import {
  createRawEmail,
  createRawEmailWithAttachments,
  processEmailBody,
  resolveBodyFromFile,
} from '../lib/helpers.js';

/**
 * send-message — Send an email message from the specified account.
 */
export function registerSendMessageTool(app: AgentApp): void {
  app.tool('send-message', {
    description: 'Send an email message from the specified account.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body (plain text or HTML)' },
        bodyFile: {
          type: 'string',
          description:
            'Path to a file to use as email body (.html/.htm → HTML, .md/.markdown → Markdown auto-converted to HTML, .txt → plain text). Use instead of body to avoid passing large content as a string.',
        },
        cc: { type: 'string', description: 'CC recipients (comma-separated)' },
        bcc: { type: 'string', description: 'BCC recipients (comma-separated)' },
        isHtml: { type: 'boolean', description: 'Whether body is HTML (default: false)' },
        attachments: {
          type: 'array',
          description: 'Array of attachments to include',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path' },
              filename: { type: 'string', description: 'Optional custom filename' },
            },
            required: ['path'],
          },
        },
      },
      required: ['to', 'subject'],
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
      const attachments = a.attachments as Array<{ path: string; filename?: string }> | undefined;

      // Resolve body: from file or from args.body
      const bodyFile = a.bodyFile as string | undefined;
      const rawBody = bodyFile
        ? resolveBodyFromFile(bodyFile)
        : { body: a.body as string, isHtml: a.isHtml as boolean | undefined };

      if (!rawBody.body) {
        throw new Error('Either body or bodyFile must be provided.');
      }

      // Process body: auto-convert Markdown to HTML if detected
      const { body: processedBody, isHtml } = await processEmailBody(rawBody.body, rawBody.isHtml);

      const rawEmail =
        attachments && attachments.length > 0
          ? createRawEmailWithAttachments(
              a.to as string,
              a.subject as string,
              processedBody,
              email,
              attachments,
              {
                cc: a.cc as string | undefined,
                bcc: a.bcc as string | undefined,
                isHtml,
                fromName: displayName,
              },
            )
          : createRawEmail(a.to as string, a.subject as string, processedBody, email, {
              cc: a.cc as string | undefined,
              bcc: a.bcc as string | undefined,
              isHtml,
              fromName: displayName,
            });

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: rawEmail },
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
