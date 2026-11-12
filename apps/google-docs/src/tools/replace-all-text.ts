import type { AgentApp } from '@agentapps/sdk';
import {
  ensureAuthenticated,
  initializeGoogleClients,
  processEscapeSequences,
  withAuthRetry,
} from '../lib/index.js';

export function registerReplaceAllTextTool(app: AgentApp): void {
  app.tool('replace-all-text', {
    description:
      'Find and replace all occurrences of a text string across the entire Google Doc. Returns the number of occurrences changed.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document',
        },
        findText: {
          type: 'string',
          description: 'The text to search for',
        },
        replaceText: {
          type: 'string',
          description: 'The text to replace each occurrence with',
        },
        matchCase: {
          type: 'boolean',
          description: 'Whether the search should be case-sensitive (default: true)',
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
        replaceText: rawReplaceText,
        matchCase = true,
      } = args as {
        documentId: string;
        findText: string;
        replaceText: string;
        matchCase?: boolean;
      };

      const replaceText = processEscapeSequences(rawReplaceText);

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
        'replace-all-text',
      );
    },
  });
}
