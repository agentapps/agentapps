import type { AgentApp } from '@agentapps/sdk';
import {
  ensureAuthenticated,
  initializeGoogleClients,
  processEscapeSequences,
  withAuthRetry,
} from '../lib/index.js';

export function registerCreateDocumentTool(app: AgentApp): void {
  app.tool('create-document', {
    description:
      'Create a new Google Doc with a title and optional initial content. Returns the document ID and URL.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the new Google Doc',
        },
        content: {
          type: 'string',
          description:
            'Optional initial text content for the document. Supports \\n for line breaks.',
        },
      },
      required: ['title'],
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

      const { title, content: rawContent } = args as {
        title: string;
        content?: string;
      };

      if (typeof title !== 'string' || title.trim().length === 0) {
        throw new Error('title is required and must be a non-empty string.');
      }

      return withAuthRetry(
        ctx,
        async () => {
          const createResponse = await clients.docs.documents.create({
            requestBody: {
              title,
            },
          });

          const documentId = createResponse.data.documentId!;

          if (rawContent && rawContent.length > 0) {
            const content = processEscapeSequences(rawContent);

            await clients.docs.documents.batchUpdate({
              documentId,
              requestBody: {
                requests: [
                  {
                    insertText: {
                      location: { index: 1 },
                      text: content,
                    },
                  },
                ],
              },
            });
          }

          return {
            documentId,
            title,
            url: `https://docs.google.com/document/d/${documentId}/edit`,
          };
        },
        'create-document',
      );
    },
  });
}
