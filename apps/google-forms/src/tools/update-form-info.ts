import type { AgentApp } from '@agentapps/sdk';
import type { forms_v1 } from 'googleapis';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

/** Extended type — the Forms API may return revisionId not present in v144 types. */
interface ExtendedBatchUpdateResponse extends forms_v1.Schema$BatchUpdateFormResponse {
  revisionId?: string;
}

/**
 * update-form-info — Update form metadata (title, description, documentTitle).
 */
export function registerUpdateFormInfoTool(app: AgentApp): void {
  app.tool('update-form-info', {
    description:
      'Update the metadata of a Google Form — title, description, or document title. This is a convenience wrapper around the batchUpdate API. Params: formId (required), title?, description?, documentTitle?.',
    parameters: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The ID of the form to update',
        },
        title: {
          type: 'string',
          description: 'New title for the form (shown to respondents)',
        },
        description: {
          type: 'string',
          description: 'New description for the form',
        },
        documentTitle: {
          type: 'string',
          description: 'New document title (shown in Google Drive)',
        },
      },
      required: ['formId'],
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

      const { formId, title, description, documentTitle } = args as {
        formId: string;
        title?: string;
        description?: string;
        documentTitle?: string;
      };

      // Build the updateMask from provided fields
      const fields: string[] = [];
      const info: Record<string, string> = {};

      if (title !== undefined) {
        fields.push('title');
        info.title = title;
      }
      if (description !== undefined) {
        fields.push('description');
        info.description = description;
      }
      if (documentTitle !== undefined) {
        fields.push('documentTitle');
        info.documentTitle = documentTitle;
      }

      if (fields.length === 0) {
        throw new Error('At least one of title, description, or documentTitle must be provided.');
      }

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.forms.forms.batchUpdate({
            formId,
            requestBody: {
              requests: [
                {
                  updateFormInfo: {
                    info,
                    updateMask: fields.join(','),
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
                  documentTitle: result.form.info?.documentTitle,
                  description: result.form.info?.description,
                  responderUri: result.form.responderUri,
                }
              : undefined,
          };
        },
        'update-form-info',
      );
    },
  });
}
