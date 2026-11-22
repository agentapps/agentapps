import type { AgentApp } from '@agentapps/sdk';
import { safeAttachmentName } from '../lib/helpers.js';
import { createGraphClient } from '../lib/index.js';

/**
 * get-attachment — GET /me/messages/{messageId}/attachments/{attachmentId}.
 */
export function registerGetAttachmentTool(app: AgentApp): void {
  app.tool('get-attachment', {
    description: 'Get the content of an email attachment by its attachment ID.',
    parameters: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description: 'The ID of the message containing the attachment',
        },
        attachmentId: { type: 'string', description: 'The ID of the attachment to retrieve' },
        saveToFile: {
          type: 'boolean',
          description: 'If true, saves the attachment to /workspace/email-attachments/',
        },
      },
      required: ['messageId', 'attachmentId'],
    },
    // Not read-only: with saveToFile it writes the attachment to /workspace/email-attachments on
    // the machine, under the name the sender gave it, overwriting a file of the same name.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = args as Record<string, unknown>;
      const messageId = a.messageId as string;
      const attachmentId = a.attachmentId as string;
      const saveToFile = (a.saveToFile as boolean) || false;

      const attachment = await graphRequest(
        'GET',
        `/me/messages/${messageId}/attachments/${attachmentId}`,
      );

      if (saveToFile && attachment.contentBytes) {
        const { mkdirSync, writeFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const dir = '/workspace/email-attachments';
        mkdirSync(dir, { recursive: true });
        // The name comes from the email's sender.
        const filePath = join(dir, safeAttachmentName(attachment.name));
        writeFileSync(filePath, Buffer.from(attachment.contentBytes, 'base64'));
        return { account: email, name: attachment.name, savedTo: filePath, size: attachment.size };
      }

      return {
        account: email,
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.size,
        contentBytes: attachment.contentBytes,
      };
    },
  });
}
