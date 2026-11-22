import type { AgentApp } from '@agentapps/sdk';
import { buildRecipients, createGraphClient, processEmailBody } from '../lib/index.js';

/**
 * update-draft — PATCH /me/messages/{draftId}.
 */
export function registerUpdateDraftTool(app: AgentApp): void {
  app.tool('update-draft', {
    description: 'Update an existing draft email by replacing its content.',
    parameters: {
      type: 'object',
      properties: {
        draftId: { type: 'string', description: 'The ID of the draft to update' },
        to: { type: 'string', description: 'Recipient email address(es)' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body' },
        cc: { type: 'string', description: 'CC recipients (comma-separated)' },
        bcc: { type: 'string', description: 'BCC recipients (comma-separated)' },
        isHtml: { type: 'boolean', description: 'Whether body is HTML (default: false)' },
      },
      required: ['draftId'],
    },
    // Edits an unsent draft; setting the fields again undoes it.
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
      const draftId = a.draftId as string;
      const updates: any = {};

      if (a.subject) updates.subject = a.subject as string;
      if (a.to) updates.toRecipients = buildRecipients(a.to as string);
      if (a.cc) updates.ccRecipients = buildRecipients(a.cc as string);
      if (a.bcc) updates.bccRecipients = buildRecipients(a.bcc as string);

      if (a.body) {
        const { body: processedBody, isHtml } = await processEmailBody(
          a.body as string,
          a.isHtml as boolean | undefined,
        );
        updates.body = { contentType: isHtml ? 'HTML' : 'Text', content: processedBody };
      }

      await graphRequest('PATCH', `/me/messages/${draftId}`, updates);

      return { success: true, account: email, draftId };
    },
  });
}
