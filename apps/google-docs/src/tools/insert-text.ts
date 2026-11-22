import type { AgentApp } from '@agentapps/sdk';
import {
  ensureAuthenticated,
  initializeGoogleClients,
  processEscapeSequences,
  withAuthRetry,
} from '../lib/index.js';

export function registerInsertTextTool(app: AgentApp): void {
  app.tool('insert-text', {
    description:
      'Insert text at a specific position in a Google Doc. Index 1 is the start of the document.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document',
        },
        text: {
          type: 'string',
          description: 'Text to insert',
        },
        index: {
          type: 'number',
          description:
            'Position to insert at (1 = start of document). Use read-document to find positions.',
        },
      },
      required: ['documentId', 'text', 'index'],
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

      const {
        documentId,
        text: rawText,
        index,
      } = args as {
        documentId: string;
        text: string;
        index: number;
      };

      const text = processEscapeSequences(rawText);

      return withAuthRetry(
        ctx,
        async () => {
          await clients.docs.documents.batchUpdate({
            documentId,
            requestBody: {
              requests: [
                {
                  insertText: {
                    location: {
                      index,
                    },
                    text,
                  },
                },
              ],
            },
          });

          return {
            success: true,
            message: `Inserted ${text.length} characters at index ${index}`,
          };
        },
        'insert-text',
      );
    },
  });
}
