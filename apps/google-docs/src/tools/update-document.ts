import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerUpdateDocumentTool(app: AgentApp): void {
  app.tool('update-document', {
    description:
      'Replace all occurrences of a text string in a Google Doc. Useful for updating placeholders or specific content.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document',
        },
        findText: {
          type: 'string',
          description: 'Text to find and replace',
        },
        replaceText: {
          type: 'string',
          description: 'Text to replace with',
        },
        matchCase: {
          type: 'boolean',
          description: 'Whether to match case (default: true)',
        },
      },
      required: ['documentId', 'findText', 'replaceText'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const {
        documentId,
        findText,
        replaceText,
        matchCase = true,
      } = args as {
        documentId: string;
        findText: string;
        replaceText: string;
        matchCase?: boolean;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.docs.documents.batchUpdate({
            documentId,
            requestBody: {
              requests: [
                {
                  replaceAllText: {
                    containsText: {
                      text: findText,
                      matchCase,
                    },
                    replaceText,
                  },
                },
              ],
            },
          });

          const replaceResult = response.data.replies?.[0]?.replaceAllText;

          return {
            success: true,
            occurrencesChanged: replaceResult?.occurrencesChanged || 0,
          };
        },
        'update-document',
      );
    },
  });
}
