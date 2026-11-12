import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

/**
 * create-form — Create a new Google Form.
 */
export function registerCreateFormTool(app: AgentApp): void {
  app.tool('create-form', {
    description:
      'Create a new Google Form with a title. Returns the form ID and responder URL. Params: title (required), documentTitle? (defaults to the form title).',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title of the form (shown to respondents)',
        },
        documentTitle: {
          type: 'string',
          description:
            'Optional: The document title shown in Google Drive (defaults to the form title if not provided)',
        },
      },
      required: ['title'],
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      idempotentHint: false,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { title, documentTitle } = args as {
        title: string;
        documentTitle?: string;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.forms.forms.create({
            requestBody: {
              info: {
                title,
                documentTitle: documentTitle || title,
              },
            },
          });

          const form = response.data;

          return {
            formId: form.formId,
            title: form.info?.title,
            documentTitle: form.info?.documentTitle,
            responderUri: form.responderUri,
            linkedSheetId: form.linkedSheetId,
            revisionId: form.revisionId,
          };
        },
        'create-form',
      );
    },
  });
}
