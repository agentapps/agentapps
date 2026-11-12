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
 * add-question — Add a question item to a Google Form.
 */
export function registerAddQuestionTool(app: AgentApp): void {
  app.tool('add-question', {
    description: `Add a question item to a Google Form at a specific position.

Supported question types in \`questionItem.question\`:
- **textQuestion**: \`{ paragraph: false }\` (short answer) or \`{ paragraph: true }\` (paragraph)
- **choiceQuestion**: \`{ type: "RADIO"|"CHECKBOX"|"DROP_DOWN", options: [{ value: "Option 1" }, ...] }\`
- **scaleQuestion**: \`{ low: 1, high: 5, lowLabel: "Bad", highLabel: "Good" }\`
- **dateQuestion**: \`{ includeTime: false, includeYear: true }\`
- **timeQuestion**: \`{ duration: false }\`

Params: formId (required), title (required), questionItem (required), index? (insert position, defaults to end), description?.`,
    parameters: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The ID of the form to add the question to',
        },
        title: {
          type: 'string',
          description: 'The title / prompt of the question',
        },
        description: {
          type: 'string',
          description: 'Optional description shown below the question title',
        },
        questionItem: {
          type: 'object',
          description:
            'The question item object containing the question definition. Must include a `question` property with the question type (textQuestion, choiceQuestion, scaleQuestion, dateQuestion, or timeQuestion).',
        },
        index: {
          type: 'number',
          description:
            'Position to insert the question at (0-based). If omitted, appends to the end.',
        },
      },
      required: ['formId', 'title', 'questionItem'],
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

      const { formId, title, description, questionItem, index } = args as {
        formId: string;
        title: string;
        description?: string;
        questionItem: Record<string, unknown>;
        index?: number;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const item: Record<string, unknown> = {
            title,
            questionItem,
          };
          if (description !== undefined) {
            item.description = description;
          }

          const createItemRequest: Record<string, unknown> = { item };
          if (index !== undefined) {
            createItemRequest.location = { index };
          }

          const response = await clients.forms.forms.batchUpdate({
            formId,
            requestBody: {
              requests: [{ createItem: createItemRequest }],
              includeFormInResponse: true,
            },
          });

          const result = response.data as ExtendedBatchUpdateResponse;

          // Extract the created item info from replies
          const createReply = result.replies?.[0]?.createItem;

          return {
            revisionId: result.revisionId,
            createdItem: createReply
              ? {
                  itemId: createReply.itemId,
                  questionId: createReply.questionId,
                }
              : undefined,
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
        'add-question',
      );
    },
  });
}
