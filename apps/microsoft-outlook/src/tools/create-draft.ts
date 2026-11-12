import type { AgentApp } from '@agentapps/sdk';
import { buildRecipients, createGraphClient, processEmailBody } from '../lib/index.js';

/**
 * create-draft — POST /me/messages.
 */
export function registerCreateDraftTool(app: AgentApp): void {
  app.tool('create-draft', {
    description: 'Create a draft email message.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address(es)' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body' },
        cc: { type: 'string', description: 'CC recipients (comma-separated)' },
        bcc: { type: 'string', description: 'BCC recipients (comma-separated)' },
        isHtml: { type: 'boolean', description: 'Whether body is HTML (default: false)' },
        importance: { type: 'string', description: 'Message importance: low, normal, high' },
      },
      required: ['to', 'subject', 'body'],
    },
    annotations: {
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

      const draft: any = {
        subject: a.subject as string,
        body: {
          contentType: isHtml ? 'HTML' : 'Text',
          content: processedBody,
        },
        toRecipients: buildRecipients(a.to as string),
      };

      if (a.cc) draft.ccRecipients = buildRecipients(a.cc as string);
      if (a.bcc) draft.bccRecipients = buildRecipients(a.bcc as string);
      if (a.importance) draft.importance = a.importance as string;

      const created = await graphRequest('POST', '/me/messages', draft);

      return { success: true, account: email, draftId: created.id };
    },
  });
}
