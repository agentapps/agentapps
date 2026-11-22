import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

/**
 * list-watches — List watches on a Google Form.
 */
export function registerListWatchesTool(app: AgentApp): void {
  app.tool('list-watches', {
    description:
      'List all watches on a Google Form owned by the invoking project. The maximum number of watches is two per form (one per event type). Params: formId (required).',
    parameters: {
      type: 'object',
      properties: {
        formId: {
          type: 'string',
          description: 'The ID of the form whose watches to list',
        },
      },
      required: ['formId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { formId } = args as { formId: string };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.forms.forms.watches.list({ formId });
          const watches = response.data.watches || [];

          return {
            watches: watches.map((w) => ({
              id: w.id,
              eventType: w.eventType,
              target: w.target,
              state: w.state,
              errorType: w.errorType,
              createTime: w.createTime,
              expireTime: w.expireTime,
            })),
          };
        },
        'list-watches',
      );
    },
  });
}
