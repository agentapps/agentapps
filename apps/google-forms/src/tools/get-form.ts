import type { AgentApp } from '@agentapps/sdk';
import {
  ensureAuthenticated,
  formatItem,
  initializeGoogleClients,
  withAuthRetry,
} from '../lib/index.js';

/**
 * get-form — Get the full structure of a Google Form by its ID.
 */
export function registerGetFormTool(app: AgentApp): void {
  app.tool('get-form', {
    description:
      'Get the full structure of a Google Form by its ID, including all items and questions. Params: formId (required).',
    parameters: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The ID of the form to retrieve',
        },
      },
      required: ['formId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { formId } = args as { formId: string };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.forms.forms.get({ formId });
          const form = response.data;

          return {
            formId: form.formId,
            title: form.info?.title,
            documentTitle: form.info?.documentTitle,
            description: form.info?.description,
            responderUri: form.responderUri,
            linkedSheetId: form.linkedSheetId,
            revisionId: form.revisionId,
            settings: form.settings,
            items: (form.items || []).map(formatItem),
          };
        },
        'get-form',
      );
    },
  });
}
