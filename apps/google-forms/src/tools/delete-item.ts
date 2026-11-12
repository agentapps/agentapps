import type { AgentApp } from '@agentapps/sdk';
import type { forms_v1 } from 'googleapis';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

/** Extended type — the Forms API may return revisionId not present in v144 types. */
interface ExtendedBatchUpdateResponse extends forms_v1.Schema$BatchUpdateFormResponse {
  revisionId?: string;
}

/**
 * delete-item — Delete a form item by its index position.
 */
export function registerDeleteItemTool(app: AgentApp): void {
  app.tool('delete-item', {
    description:
      'Delete an item (question, section, etc.) from a Google Form by its index position. Use get-form first to see current items and their positions. Params: formId (required), index (required — 0-based position of the item to delete).',
    parameters: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The ID of the form containing the item to delete',
        },
        index: {
          type: 'number',
          description: 'The 0-based index of the item to delete',
        },
      },
      required: ['formId', 'index'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
      idempotentHint: false,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { formId, index } = args as {
        formId: string;
        index: number;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.forms.forms.batchUpdate({
            formId,
            requestBody: {
              requests: [
                {
                  deleteItem: {
                    location: { index },
                  },
                },
              ],
              includeFormInResponse: true,
            },
          });

          const result = response.data as ExtendedBatchUpdateResponse;

          return {
            revisionId: result.revisionId,
            form: result.form
              ? {
                  formId: result.form.formId,
                  title: result.form.info?.title,
                  itemCount: result.form.items?.length ?? 0,
                }
              : undefined,
          };
        },
        'delete-item',
      );
    },
  });
}
