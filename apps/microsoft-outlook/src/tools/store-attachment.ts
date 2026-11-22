import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { safeAttachmentName } from '../lib/helpers.js';
import { createGraphClient } from '../lib/index.js';

/**
 * store-attachment — download and save an attachment to the local filesystem.
 */
export function registerStoreAttachmentTool(app: AgentApp): void {
  app.tool('store-attachment', {
    description: 'Download and store an email attachment to the local filesystem.',
    parameters: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description: 'The ID of the message containing the attachment',
        },
        attachmentId: { type: 'string', description: 'The ID of the attachment to store' },
        outputPath: { type: 'string', description: 'Optional output directory path' },
      },
      required: ['messageId', 'attachmentId'],
    },
    // Writes to any outputPath on the machine and silently overwrites a file of the same name.
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
      const outputPath = (a.outputPath as string) || '/workspace/email-attachments';

      const attachment = await graphRequest(
        'GET',
        `/me/messages/${messageId}/attachments/${attachmentId}`,
      );

      mkdirSync(outputPath, { recursive: true });
      // The name comes from the email's sender.
      const filePath = join(outputPath, safeAttachmentName(attachment.name));
      writeFileSync(filePath, Buffer.from(attachment.contentBytes, 'base64'));

      return {
        success: true,
        account: email,
        name: attachment.name,
        savedTo: filePath,
        size: attachment.size,
      };
    },
  });
}
