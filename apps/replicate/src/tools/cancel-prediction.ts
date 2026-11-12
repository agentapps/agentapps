/**
 * cancel_prediction — cancel a running or queued prediction.
 */

import type { AgentApp } from '@agentapps/sdk';
import { assertOk, replicateRequest } from '../types.js';

export function registerCancelPredictionTool(app: AgentApp): void {
  app.tool('cancel_prediction', {
    description: 'Cancel a running or queued prediction by ID.',
    parameters: {
      type: 'object',
      properties: {
        predictionId: {
          type: 'string',
          description: 'The prediction ID to cancel',
        },
      },
      required: ['predictionId'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args, ctx) => {
      const apiToken = await ctx.systemSecret('API_TOKEN');
      if (!apiToken) {
        throw new Error('Missing API_TOKEN system secret — configure it to use Replicate.');
      }

      const predictionId = args.predictionId as string;
      ctx.log('info', `Cancelling prediction: ${predictionId}`);

      const response = await replicateRequest(`/predictions/${predictionId}/cancel`, apiToken, {
        method: 'POST',
      });
      await assertOk(response);
      return await response.json();
    },
  });
}
