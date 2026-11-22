import type { AgentApp } from '@agentapps/sdk';
import {
  ensureAuthenticated,
  initializeGoogleClients,
  processEscapeSequences,
  withAuthRetry,
} from '../lib/index.js';

/**
 * replace-text — batchUpdate with replaceAllText request.
 */
export function registerReplaceTextTool(app: AgentApp): void {
  app.tool('replace-text', {
    description:
      'Replace all occurrences of a text string across an entire Google Slides presentation. ' +
      'Uses the Slides API replaceAllText request to find and replace text in all slides at once.',
    parameters: {
      type: 'object',
      properties: {
        presentationId: {
          type: 'string',
          description: 'The ID of the presentation',
        },
        findText: {
          type: 'string',
          description: 'Text to find and replace',
        },
        replaceText: {
          type: 'string',
          description: 'Text to replace with. Supports \\n for line breaks.',
        },
        matchCase: {
          type: 'boolean',
          description: 'Whether to match case (default: true)',
        },
      },
      required: ['presentationId', 'findText', 'replaceText'],
    },
    // Overwrites every match in the whole presentation; replacing back does not restore it when
    // the new text also appeared elsewhere.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const {
        presentationId,
        findText,
        replaceText: rawReplaceText,
        matchCase = true,
      } = args as {
        presentationId: string;
        findText: string;
        replaceText: string;
        matchCase?: boolean;
      };

      const replaceTextValue = processEscapeSequences(rawReplaceText);

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.slides.presentations.batchUpdate({
            presentationId,
            requestBody: {
              requests: [
                {
                  replaceAllText: {
                    containsText: {
                      text: findText,
                      matchCase,
                    },
                    replaceText: replaceTextValue,
                  },
                },
              ],
            },
          });

          const occurrencesChanged =
            response.data.replies?.[0]?.replaceAllText?.occurrencesChanged || 0;

          return {
            success: true,
            presentationId,
            occurrencesChanged,
          };
        },
        'replace-text',
      );
    },
  });
}
