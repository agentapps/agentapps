/**
 * get_prediction — poll prediction status and retrieve results.
 */

import type { AgentApp } from '@agentapps/sdk';
import { assertOk, replicateRequest } from '../types.js';

export function registerGetPredictionTool(app: AgentApp): void {
  app.tool('get_prediction', {
    description:
      'Get the status and result of a prediction by ID. ' +
      'Poll this after run until status is "succeeded" or "failed". ' +
      'When succeeded, the output field contains the result (image URL, video URL, etc.).',
    parameters: {
      type: 'object',
      properties: {
        predictionId: {
          type: 'string',
          description: 'The prediction ID returned by run',
        },
      },
      required: ['predictionId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const apiToken = await ctx.systemSecret('API_TOKEN');
      if (!apiToken) {
        throw new Error('Missing API_TOKEN system secret — configure it to use Replicate.');
      }

      const predictionId = args.predictionId as string;
      ctx.log('info', `Getting prediction: ${predictionId}`);

      const response = await replicateRequest(`/predictions/${predictionId}`, apiToken);
      await assertOk(response);
      return await response.json();
    },
  });
}
