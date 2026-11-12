import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';
import { findAttachments } from '../lib/helpers.js';

/**
 * store-attachment — Download and store an email attachment to the local filesystem.
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
        attachmentId: {
          type: 'string',
          description: 'The ID of the attachment to store',
        },
        outputPath: {
          type: 'string',
          description: 'Optional output directory path',
        },
      },
      required: ['messageId', 'attachmentId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const secrets = await getSecrets(ctx);
      const { gmail, email } = await createGmailClient(secrets);

      const a = (args ?? {}) as Record<string, unknown>;
      const messageId = a.messageId as string;
      const attachmentId = a.attachmentId as string;
      const customOutputPath = a.outputPath as string | undefined;

      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
      });

      const attachmentData = response.data.data;
      if (!attachmentData) {
        throw new Error('Attachment data not found');
      }

      const base64Data = attachmentData.replace(/-/g, '+').replace(/_/g, '/');
      const buffer = Buffer.from(base64Data, 'base64');

      const messageResponse = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const allAttachments = findAttachments(messageResponse.data.payload);
      const originalFilename =
        allAttachments.length === 1 && allAttachments[0].filename
          ? allAttachments[0].filename
          : 'attachment';

      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');
      const filenameParts = originalFilename.split('.');
      const extension = filenameParts.length > 1 ? filenameParts.pop() : '';
      const baseName = filenameParts.join('.');
      const filename = extension
        ? `${timestamp}_${baseName}.${extension}`
        : `${timestamp}_${originalFilename}`;
      const outputDir =
        customOutputPath || join(process.env.HOME || '/tmp', 'Downloads', 'email-attachments');
      const outputPath = join(outputDir, filename);

      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      writeFileSync(outputPath, buffer);

      return {
        account: email,
        messageId,
        attachmentId,
        size: response.data.size,
        filename,
        savedTo: outputPath,
      };
    },
  });
}
