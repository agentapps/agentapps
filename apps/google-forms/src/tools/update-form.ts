import type { AgentApp } from '@agentapps/sdk';
import type { forms_v1 } from 'googleapis';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

/** Extended type — the Forms API may return revisionId not present in v144 types. */
interface ExtendedBatchUpdateResponse extends forms_v1.Schema$BatchUpdateFormResponse {
  revisionId?: string;
}

/**
 * update-form — Update a Google Form using batch update requests.
 */
export function registerUpdateFormTool(app: AgentApp): void {
  app.tool('update-form', {
    description: `Update a Google Form using batch update requests. Supports adding, editing, and deleting items, as well as updating form info and settings.

Available request types in the \`requests\` array:

- **createItem**: Add a new item (question, section, etc.) at a specific location.
  \`{ createItem: { item: { title, questionItem: { question: { required, choiceQuestion | textQuestion | scaleQuestion | dateQuestion | timeQuestion } } }, location: { index: 0 } } }\`

- **updateItem**: Modify an existing item by its ID.
  \`{ updateItem: { item: { itemId, title, ... }, location: { index: 0 }, updateMask: "title,description" } }\`

- **deleteItem**: Remove an item by its location index.
  \`{ deleteItem: { location: { index: 0 } } }\`

- **updateFormInfo**: Update the form title, description, or document title.
  \`{ updateFormInfo: { info: { title, description, documentTitle }, updateMask: "title,description" } }\`

- **updateSettings**: Change form settings such as quiz mode or response collection.
  \`{ updateSettings: { settings: { quizSettings: { isQuiz: true } }, updateMask: "quizSettings.isQuiz" } }\`

See https://developers.google.com/forms/api/reference/rest/v1/forms/batchUpdate for full schemas. Params: formId (required), requests (required — array of update requests).`,
    parameters: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The ID of the form to update',
        },
        requests: {
          type: 'array',
          description:
            'Array of update requests. Each request is one of: createItem, updateItem, deleteItem, updateFormInfo, or updateSettings.',
          items: {
            type: 'object',
          },
        },
      },
      required: ['formId', 'requests'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: false,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { formId, requests } = args as {
        formId: string;
        requests: Record<string, unknown>[];
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.forms.forms.batchUpdate({
            formId,
            requestBody: {
              requests,
              includeFormInResponse: true,
            },
          });

          const result = response.data as ExtendedBatchUpdateResponse;

          return {
            revisionId: result.revisionId,
            writeControl: result.writeControl,
            replies: result.replies,
            form: result.form
              ? {
                  formId: result.form.formId,
                  title: result.form.info?.title,
                  documentTitle: result.form.info?.documentTitle,
                  description: result.form.info?.description,
                  responderUri: result.form.responderUri,
                  itemCount: result.form.items?.length ?? 0,
                }
              : undefined,
          };
        },
        'update-form',
      );
    },
  });
}
