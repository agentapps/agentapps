import type { AgentApp } from '@agentapps/sdk';
import type { forms_v1 } from 'googleapis';
import {
  ensureAuthenticated,
  formatItem,
  initializeGoogleClients,
  withAuthRetry,
} from '../lib/index.js';

/** Extended type — the Forms API may return revisionId not present in v144 types. */
interface ExtendedBatchUpdateResponse extends forms_v1.Schema$BatchUpdateFormResponse {
  revisionId?: string;
}

/**
 * update-item — Update an existing form item (question, section, etc.).
 */
export function registerUpdateItemTool(app: AgentApp): void {
  app.tool('update-item', {
    description: `Update an existing item in a Google Form. You must provide the item object with the itemId of the item to update, and an updateMask specifying which fields to change.

Common updateMask values:
- \`"title"\` — update the item title
- \`"description"\` — update the item description
- \`"title,description"\` — update both
- \`"questionItem.question.required"\` — change whether a question is required
- \`"questionItem.question.choiceQuestion.options"\` — update choice options

Params: formId (required), item (required — must include itemId), location (required — the index of the item), updateMask (required — comma-separated field paths to update).`,
    parameters: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The ID of the form containing the item to update',
        },
        item: {
          type: 'object',
          description:
            'The updated item object. Must include `itemId` to identify which item to update, plus the fields being changed.',
        },
        location: {
          type: 'object',
          description: 'The location of the item, e.g. `{ "index": 0 }`. Required by the API.',
          properties: {
            index: {
              type: 'number',
              description: 'The 0-based index of the item',
            },
          },
          required: ['index'],
        },
        updateMask: {
          type: 'string',
          description:
            'Comma-separated list of field paths to update, e.g. "title", "title,description", "questionItem.question.required".',
        },
      },
      required: ['formId', 'item', 'location', 'updateMask'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { formId, item, location, updateMask } = args as {
        formId: string;
        item: Record<string, unknown>;
        location: { index: number };
        updateMask: string;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.forms.forms.batchUpdate({
            formId,
            requestBody: {
              requests: [
                {
                  updateItem: {
                    item,
                    location,
                    updateMask,
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
                  items: (result.form.items || []).map(formatItem),
                }
              : undefined,
          };
        },
        'update-item',
      );
    },
  });
}
