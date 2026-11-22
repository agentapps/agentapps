import type { AgentApp } from '@agentapps/sdk';
import {
  pollRequestWithProgress,
  resolveCredentials,
  submitRequest,
} from '../lib/higgsfield-client.js';

/**
 * run — generic model runner.
 *
 * Submits a request to any Higgsfield model endpoint. Optionally polls
 * for completion when `wait` is true.
 */
export function registerRunTool(app: AgentApp): void {
  app.tool('run', {
    description:
      'Run any model on Higgsfield. Supports text-to-image, image-to-video, and other AI generation models. Params: model (required — endpoint identifier, e.g. "bytedance/seedream/v4/text-to-image"), input (required — model parameters), wait? (poll for completion, default false).',
    parameters: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          description: 'Model/endpoint identifier (e.g., "bytedance/seedream/v4/text-to-image")',
        },
        input: {
          type: 'object',
          description: 'Input parameters for the model',
        },
        wait: {
          type: 'boolean',
          description: 'Wait for completion (default: false)',
          default: false,
        },
      },
      required: ['model', 'input'],
    },
    annotations: {
      readOnlyHint: false,
      // Submits a paid generation: the credits it spends cannot be taken back.
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const credentials = await resolveCredentials(ctx);
      const result = await submitRequest(
        args.model as string,
        args.input as Record<string, unknown>,
        credentials,
      );

      if (args.wait) {
        return await pollRequestWithProgress(result.request_id as string, credentials);
      }

      return {
        request_id: result.request_id,
        status: result.status,
        status_url: result.status_url,
        cancel_url: result.cancel_url,
        message: 'Request submitted. Use get-prediction to check status.',
      };
    },
  });
}
