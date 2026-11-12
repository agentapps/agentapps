import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerDeleteContentTool(app: AgentApp): void {
  app.tool('delete-content', {
    description:
      'Delete content in a range from a Google Doc. Use read-document to find the start and end indices.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document',
        },
        startIndex: {
          type: 'number',
          description:
            'Start index of the range to delete (inclusive). Index 1 is the start of the document.',
        },
        endIndex: {
          type: 'number',
          description: 'End index of the range to delete (exclusive).',
        },
      },
      required: ['documentId', 'startIndex', 'endIndex'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { documentId, startIndex, endIndex } = args as {
        documentId: string;
        startIndex: number;
        endIndex: number;
      };

      if (startIndex < 1) {
        throw new Error('startIndex must be at least 1.');
      }
      if (endIndex <= startIndex) {
        throw new Error('endIndex must be greater than startIndex.');
      }

      return withAuthRetry(
        ctx,
        async () => {
          await clients.docs.documents.batchUpdate({
            documentId,
            requestBody: {
              requests: [
                {
                  deleteContentRange: {
                    range: {
                      startIndex,
                      endIndex,
                    },
                  },
                },
              ],
            },
          });

          return {
            success: true,
            message: `Deleted content from index ${startIndex} to ${endIndex}`,
          };
        },
        'delete-content',
      );
    },
  });
}
