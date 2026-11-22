import type { AgentApp } from '@agentapps/sdk';
import {
  higgsFieldRequest,
  pollRequestWithProgress,
  resolveCredentials,
} from '../lib/higgsfield-client.js';

/**
 * get-prediction — check the status and result of a prediction.
 */
export function registerGetPredictionTool(app: AgentApp): void {
  app.tool('get-prediction', {
    description:
      'Get the status and result of a prediction by ID. Params: prediction_id (required), wait? (poll for completion if still processing, default false).',
    parameters: {
      type: 'object',
      properties: {
        prediction_id: {
          type: 'string',
          description: 'The prediction ID to check',
        },
        wait: {
          type: 'boolean',
          default: false,
          description: 'Wait for completion if still processing (default: false)',
        },
      },
      required: ['prediction_id'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const credentials = await resolveCredentials(ctx);

      if (args.wait) {
        return await pollRequestWithProgress(args.prediction_id as string, credentials);
      }

      const response = await higgsFieldRequest(
        `/requests/${args.prediction_id}/status`,
        credentials,
      );
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${await response.text()}`);
      }

      return await response.json();
    },
  });
}
