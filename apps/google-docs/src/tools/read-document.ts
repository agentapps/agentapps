import type { AgentApp } from '@agentapps/sdk';
import {
  ensureAuthenticated,
  extractTextFromDocument,
  initializeGoogleClients,
  withAuthRetry,
} from '../lib/index.js';

export function registerReadDocumentTool(app: AgentApp): void {
  app.tool('read-document', {
    description: 'Read content from a Google Docs document.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document',
        },
      },
      required: ['documentId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { documentId } = args as { documentId: string };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.docs.documents.get({
            documentId,
          });

          const doc = response.data;
          const text = extractTextFromDocument(doc);

          return {
            title: doc.title,
            documentId: doc.documentId,
            content: text,
          };
        },
        'read-document',
      );
    },
  });
}
