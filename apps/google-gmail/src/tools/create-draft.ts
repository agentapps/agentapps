import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';
import {
  createRawEmail,
  createRawEmailWithAttachments,
  processEmailBody,
  resolveBodyFromFile,
} from '../lib/helpers.js';

/**
 * create-draft — Create a draft email message.
 */
export function registerCreateDraftTool(app: AgentApp): void {
  app.tool('create-draft', {
    description: 'Create a draft email message.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body' },
        bodyFile: {
          type: 'string',
          description:
            'Path to a file to use as email body (.html/.htm → HTML, .md/.markdown → Markdown auto-converted to HTML, .txt → plain text). Use instead of body to avoid passing large content as a string.',
        },
        isHtml: { type: 'boolean', description: 'Whether body is HTML (default: false)' },
        attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              filename: { type: 'string' },
            },
            required: ['path'],
          },
        },
      },
      required: ['to', 'subject'],
    },
    annotations: {
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
              { isHtml, fromName: displayName },
            )
          : createRawEmail(a.to as string, a.subject as string, processedBody, email, {
              isHtml,
              fromName: displayName,
            });

      const response = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: { message: { raw: rawEmail } },
      });

      return {
        success: true,
        account: email,
        draftId: response.data.id,
        messageId: response.data.message?.id,
        htmlConverted: isHtml && !(a.isHtml as boolean),
      };
    },
  });
}
