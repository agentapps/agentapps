import type { AgentApp } from '@agentapps/sdk';
import {
  ensureAuthenticated,
  formatAnswer,
  initializeGoogleClients,
  withAuthRetry,
} from '../lib/index.js';

/**
 * list-responses — List responses submitted to a Google Form.
 */
export function registerListResponsesTool(app: AgentApp): void {
  app.tool('list-responses', {
    description:
      'List responses submitted to a Google Form. Supports pagination and filtering by submission timestamp. Params: formId (required), pageSize? (default 10, max 5000), pageToken?, filter? (RFC3339 timestamp filter, e.g. "timestamp > 2024-01-01T00:00:00Z").',
    parameters: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The ID of the form to retrieve responses from',
        },
        pageSize: {
          type: 'number',
          description: 'Maximum number of responses to return (default: 10, max: 5000)',
          default: 10,
        },
        pageToken: {
          type: 'string',
          description: 'Pagination token from a previous response to get the next page',
        },
        filter: {
          type: 'string',
          description:
            'Optional timestamp filter in RFC3339 format. Example: "timestamp > 2024-01-01T00:00:00Z" — returns only responses submitted after that time.',
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

      const {
        formId,
        pageSize = 10,
        pageToken,
        filter,
      } = args as {
        formId: string;
        pageSize?: number;
        pageToken?: string;
        filter?: string;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.forms.forms.responses.list({
            formId,
            pageSize: Math.min(pageSize, 5000),
            pageToken: pageToken || undefined,
            filter: filter || undefined,
          });

          const responses = response.data.responses || [];

          return {
            responses: responses.map((r) => ({
              responseId: r.responseId,
              createTime: r.createTime,
              lastSubmittedTime: r.lastSubmittedTime,
              respondentEmail: r.respondentEmail,
              totalScore: r.totalScore,
              answers: r.answers
                ? Object.entries(r.answers).reduce(
                    (acc, [questionId, answer]) => {
                      acc[questionId] = formatAnswer(answer);
                      return acc;
                    },
                    {} as Record<string, unknown>,
                  )
                : {},
            })),
            nextPageToken: response.data.nextPageToken,
          };
        },
        'list-responses',
      );
    },
  });
}
