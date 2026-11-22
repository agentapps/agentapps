import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerInsertImageTool(app: AgentApp): void {
  app.tool('insert-image', {
    description:
      'Insert an inline image from a URL into a Google Doc at a specific index. The image must be publicly accessible.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document',
        },
        uri: {
          type: 'string',
          description: 'The publicly accessible URL of the image to insert',
        },
        index: {
          type: 'number',
          description:
            'Position to insert the image at (1 = start of document). Use read-document to find positions.',
        },
        width: {
          type: 'number',
          description: 'Optional width of the image in points (1 inch = 72 points)',
        },
        height: {
          type: 'number',
          description: 'Optional height of the image in points (1 inch = 72 points)',
        },
      },
      required: ['documentId', 'uri', 'index'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { documentId, uri, index, width, height } = args as {
        documentId: string;
        uri: string;
        index: number;
        width?: number;
        height?: number;
      };

      if (index < 1) {
        throw new Error('index must be at least 1.');
      }

      return withAuthRetry(
        ctx,
        async () => {
          const insertInlineImageRequest: Record<string, unknown> = {
            uri,
            location: {
              index,
            },
          };

          if (width !== undefined || height !== undefined) {
            const objectSize: Record<string, unknown> = {};
            if (width !== undefined) {
              objectSize.width = { magnitude: width, unit: 'PT' };
            }
            if (height !== undefined) {
              objectSize.height = { magnitude: height, unit: 'PT' };
            }
            insertInlineImageRequest.objectSize = objectSize;
          }

          await clients.docs.documents.batchUpdate({
            documentId,
            requestBody: {
              requests: [
                {
                  insertInlineImage: insertInlineImageRequest,
                },
              ],
            },
          });

          return {
            success: true,
            message: `Inserted image at index ${index}`,
          };
        },
        'insert-image',
      );
    },
  });
}
