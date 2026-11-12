import type { AgentApp } from '@agentapps/sdk';
import { higgsFieldRequest, resolveCredentials } from '../lib/higgsfield-client.js';

/**
 * higgsfield-cancel-prediction — cancel a queued or processing prediction.
 */
export function registerCancelPredictionTool(app: AgentApp): void {
  app.tool('higgsfield-cancel-prediction', {
    description:
      'Cancel a queued or processing prediction. IRREVERSIBLE. Params: prediction_id (required).',
    parameters: {
      type: 'object',
      properties: {
        prediction_id: {
          type: 'string',
          description: 'The prediction ID to cancel',
        },
      },
      required: ['prediction_id'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const credentials = await resolveCredentials(ctx);

      const response = await higgsFieldRequest(
        `/requests/${args.prediction_id}/cancel`,
        credentials,
        { method: 'POST' },
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${await response.text()}`);
      }

      return {
        success: true,
        message: 'Prediction cancelled successfully',
      };
    },
  });
}
