import type { AgentApp } from '@agentapps/sdk';
import {
  ensureAuthenticated,
  formatAnswer,
  initializeGoogleClients,
  withAuthRetry,
} from '../lib/index.js';

/**
 * get-response — Get a specific response to a Google Form by its response ID.
 */
export function registerGetResponseTool(app: AgentApp): void {
  app.tool('get-response', {
    description:
      'Get a specific response to a Google Form by its response ID. Params: formId (required), responseId (required).',
    parameters: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The ID of the form',
        },
        responseId: {
          type: 'string',
          description: 'The ID of the response to retrieve',
        },
      },
      required: ['formId', 'responseId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { formId, responseId } = args as { formId: string; responseId: string };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.forms.forms.responses.get({ formId, responseId });
          const r = response.data;

          return {
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
          };
        },
        'get-response',
      );
    },
  });
}
