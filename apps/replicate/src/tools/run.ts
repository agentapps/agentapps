/**
 * run — start an async prediction on Replicate.
 *
 * Always asynchronous: returns immediately with a prediction ID.
 * Use get-prediction to poll until done.
 *
 * Tip: image-generation models default to WebP output. If the image
 * will be used in iOS notifications (Pushcut), pass output_format
 * "png" or "jpg" in the input — iOS does not support WebP.
 */

import type { AgentApp } from '@agentapps/sdk';
import { assertOk, replicateRequest } from '../types.js';

export function registerRunTool(app: AgentApp): void {
  app.tool('run', {
    description:
      'Run any model on Replicate. ALWAYS asynchronous — returns immediately with a prediction ID and status "starting". ' +
      'Then use get-prediction to poll until done. ' +
      'Use list-models first to discover the model ID and its exact input parameters.',
    parameters: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
          description:
            'Model in "owner/name" format (e.g. "google/veo-3.1", "black-forest-labs/flux-kontext-pro"). ' +
            'Use list-models to find available models.',
        },
        input: {
          type: 'object',
          description:
            'Input parameters for the model. Use list-models with the model field to get the exact schema. ' +
            'For image models, include output_format "png" or "jpg" if the image will be used on iOS (default is "webp" which iOS does not support).',
        },
      },
      required: ['model', 'input'],
    },
    // Starts a billed prediction: money spent cannot be taken back.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const apiToken = await ctx.systemSecret('API_TOKEN');
      if (!apiToken) {
        throw new Error('Missing API_TOKEN system secret — configure it to use Replicate.');
      }

      const model = args.model as string;
      const input = args.input as Record<string, unknown>;

      ctx.log('info', `Running model: ${model}`, { input });

      const hasVersion = model.includes(':');
      let response: Response;

      if (hasVersion) {
        const [, version] = model.split(':');
        response = await replicateRequest('/predictions', apiToken, {
          method: 'POST',
          body: JSON.stringify({ version, input }),
        });
      } else {
        response = await replicateRequest(`/models/${model}/predictions`, apiToken, {
          method: 'POST',
          body: JSON.stringify({ input }),
        });
      }

      await assertOk(response);
      return await response.json();
    },
  });
}
